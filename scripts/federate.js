import { newStore, parser as n3Parser, sparqlConstruct, sparqlInsertDelete } from "@foerderfunke/sem-ops-utils"
import { abs, stepNum, loadDefs, makeQ } from "./utils.js"
import levenshtein from "fast-levenshtein"
import { DataFactory, Writer } from "n3"
import { createHash } from "crypto"
import path from "path"
import fs from "fs"

const DEBUG = false
const df = DataFactory

const writeTurtle = (filePath, quads, prefixes) => new Promise((resolve, reject) => {
    const writer = new Writer({ prefixes })
    for (const q of quads) writer.addQuad(df.quad(q.subject, q.predicate, q.object))
    writer.end((err, result) => {
        if (err) return reject(err)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, result)
        resolve()
    })
})

const q = makeQ(loadDefs("definitions/federation.ttl", "definitions/pipeline.ttl"))

// ---- Read Clean/Load/Federate/Merge steps ------------------------------

const rows = await q(`
    SELECT ?step ?type ?query ?graph ?inPath ?outPath ?provOutPath ?clustersOutPath WHERE {
        ?step a ?type .
        FILTER(?type IN (:Clean, :Load, :Federate, :Merge))
        OPTIONAL { ?step :query          ?query           }
        OPTIONAL { ?step :graph          ?graph           }
        OPTIONAL { ?step :input          ?inPath          }
        OPTIONAL { ?step :output         ?outPath         }
        OPTIONAL { ?step :provOutput     ?provOutPath     }
        OPTIONAL { ?step :clustersOutput ?clustersOutPath }
    }`)

const steps = new Map()
for (const r of rows) {
    if (!steps.has(r.step)) {
        steps.set(r.step, {
            type: r.type.split("#").pop(),
            query: r.query, graph: r.graph,
            inPath: r.inPath, outPath: r.outPath,
            provOutPath: r.provOutPath, clustersOutPath: r.clustersOutPath,
        })
    }
}

const sorted = [...steps.keys()].sort((a, b) => stepNum(a) - stepNum(b))

// ---- Direct-mapping generator ------------------------------------------

const XYZ = "http://sparql.xyz/facade-x/data/"
const CDP = "https://civic-data.de/pipeline#"

const buildDirectInsert = ({ sourceGraph, subjectPrefix, subjectFromPath }, fields) => {
    const v      = (path) => `?${path}`
    const optLit = (subj, path) =>
        `OPTIONAL { ${subj} <${XYZ}${path}> ${v(path)} . ` +
        `FILTER(isLiteral(${v(path)}) && ${v(path)} != "") }`

    const insertBlock = fields
        .map(f => `        ?fedIri <${f.predicate}> ${v(f.fieldPath)} .`)
        .join("\n")

    const topLevel  = fields.filter(f => !f.parentPath && f.fieldPath !== subjectFromPath)
    const subFields = fields.filter(f => f.parentPath)

    const bgp = [`?entry <${XYZ}${subjectFromPath}> ${v(subjectFromPath)} .`]
    for (const f of topLevel) bgp.push(optLit("?entry", f.fieldPath))

    const byParent = new Map()
    for (const f of subFields) {
        if (!byParent.has(f.parentPath)) byParent.set(f.parentPath, [])
        byParent.get(f.parentPath).push(f)
    }
    let parentIdx = 0
    for (const [parent, subs] of byParent) {
        const pv    = `?_p${parentIdx++}`
        const inner = subs.map(s => `    ${optLit(pv, s.fieldPath)}`).join("\n")
        bgp.push(`OPTIONAL {\n    ?entry <${XYZ}${parent}> ${pv} .\n${inner}\n  }`)
    }

    const query = `
INSERT {
    GRAPH <urn:federated> {
${insertBlock}
    }
} WHERE {
    GRAPH <${sourceGraph}> {
        ${bgp.join("\n        ")}
    }
    BIND(IRI(CONCAT("${CDP}", "${subjectPrefix}", STR(${v(subjectFromPath)}))) AS ?fedIri)
}`
    if (DEBUG) console.log("direct insert query", query)
    return query
}

const runFederate = async () => {
    const mappings = await q(`
        SELECT ?mapping ?sourceGraph ?subjectPrefix ?subjectFromPath WHERE {
            ?mapping a :Mapping .
            OPTIONAL { ?mapping :sourceGraph   ?sourceGraph }
            OPTIONAL { ?mapping :subjectPrefix ?subjectPrefix }
            OPTIONAL { ?mapping :subjectFrom   ?sf . ?sf :fieldPath ?subjectFromPath }
        } ORDER BY ?mapping`)

    for (const m of mappings) {
        const directRows = await q(`
            SELECT ?fieldPath ?predicate ?parentPath WHERE {
                <${m.mapping}> :hasFieldMapping ?fm .
                ?fm :from ?src ; :to ?tgt .
                FILTER NOT EXISTS { ?fm :via ?_v }
                ?tgt :targetPredicate ?predicate .
                ?src :fieldPath ?fieldPath .
                OPTIONAL { ?parent :hasSubField ?src . ?parent :fieldPath ?parentPath }
            }`)

        if (directRows.length && m.sourceGraph && m.subjectFromPath) {
            console.log(`federate  ${m.mapping.split("#").pop()} direct (${directRows.length} mappings)`)
            await sparqlInsertDelete(buildDirectInsert(m, directRows), fedStore)
        }

        const viaRows = await q(`
            SELECT DISTINCT ?script WHERE {
                <${m.mapping}> :hasFieldMapping ?fm .
                ?fm :via ?via .
                ?via :script ?script .
            } ORDER BY ?script`)

        for (const v of viaRows) {
            console.log(`federate  ${v.script}`)
            await sparqlInsertDelete(fs.readFileSync(abs(v.script), "utf8"), fedStore)
        }
    }
}

// ---- Merge --------------------------------------------------------------

const FED_GRAPH = df.namedNode("urn:federated")

const COMMON_PREFIXES = {
    schema: "http://schema.org/",
    locn:   "http://www.w3.org/ns/locn#",
    foaf:   "http://xmlns.com/foaf/0.1/",
    dct:    "http://purl.org/dc/terms/",
}

const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
const similarity = (a, b) => {
    const an = norm(a), bn = norm(b)
    const maxLen = Math.max(an.length, bn.length)
    if (maxLen === 0) return 1
    return 1 - levenshtein.get(an, bn) / maxLen
}

const runMerge = async (sourceStore, outPath, provOutPath, clustersOutPath) => {
    const [cfg] = await q(`
        SELECT ?ns ?prefix ?originPred ?aliasGraph WHERE {
            ?merge a :MergeRule ;
                :targetNamespace     ?ns ;
                :mintedSubjectPrefix ?prefix ;
                :originPredicate     ?originPred .
            OPTIONAL { ?merge :aliasGraph ?aliasGraph }
        }`)
    if (!cfg) throw new Error(":MergeRule config missing in federation.ttl")
    const { ns: namespace, prefix: mintedPrefix, originPred, aliasGraph } = cfg

    const criteriaRows = await q(`
        SELECT ?on ?minSim WHERE {
            ?merge a :MergeRule ; :hasMatchCriterion ?c .
            ?c :on ?on ; :minSimilarity ?minSim .
        }`)
    const criteria = criteriaRows.map(r => ({
        pred:   df.namedNode(r.on),
        minSim: parseFloat(r.minSim),
    }))

    const fedQuads = sourceStore.getQuads(null, null, null, FED_GRAPH)
    const subjects = [...new Set(fedQuads
        .filter(qu => qu.subject.termType === "NamedNode")
        .map(qu => qu.subject.value))]

    const valuesFor = new Map()
    for (const s of subjects) {
        const subj = df.namedNode(s)
        valuesFor.set(s, criteria.map(c => {
            const qs = sourceStore.getQuads(subj, c.pred, null, FED_GRAPH)
            return qs.length ? qs[0].object.value : null
        }))
    }

    const matches = (a, b) => {
        const va = valuesFor.get(a), vb = valuesFor.get(b)
        for (let i = 0; i < criteria.length; i++) {
            if (va[i] == null || vb[i] == null) return false
            if (similarity(va[i], vb[i]) < criteria[i].minSim) return false
        }
        return true
    }

    const parent = new Map(subjects.map(s => [s, s]))
    const find = (x) => {
        let r = x
        while (parent.get(r) !== r) r = parent.get(r)
        let c = x
        while (parent.get(c) !== r) { const n = parent.get(c); parent.set(c, r); c = n }
        return r
    }
    const union = (a, b) => {
        const ra = find(a), rb = find(b)
        if (ra !== rb) parent.set(ra, rb)
    }

    let aliasUnions = 0
    if (aliasGraph) {
        const OWL_SAME_AS = "http://www.w3.org/2002/07/owl#sameAs"
        const aliasQuads = n3Parser.parse(fs.readFileSync(abs(aliasGraph), "utf8"))
        for (const qu of aliasQuads) {
            if (qu.predicate.value !== OWL_SAME_AS) continue
            const a = qu.subject.value, b = qu.object.value
            if (parent.has(a) && parent.has(b)) { union(a, b); aliasUnions++ }
        }
    }

    for (let i = 0; i < subjects.length; i++) {
        for (let j = i + 1; j < subjects.length; j++) {
            if (matches(subjects[i], subjects[j])) union(subjects[i], subjects[j])
        }
    }

    const clusters = new Map()
    for (const s of subjects) {
        const root = find(s)
        if (!clusters.has(root)) clusters.set(root, [])
        clusters.get(root).push(s)
    }
    const clusterMembers = [...clusters.values()]
        .map(m => [...m].sort())
        .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]))

    const RDF_TYPE   = df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
    const CLUSTER    = df.namedNode(CDP + "Cluster")
    const HAS_MEMBER = df.namedNode(CDP + "hasMember")

    const mintedFor = new Map()
    const clusterQuads = []
    let merged = 0
    for (const members of clusterMembers) {
        const id = createHash("sha1").update(members.join("|")).digest("hex").slice(0, 12)
        const minted = df.namedNode(namespace + mintedPrefix + id)
        for (const s of members) mintedFor.set(s, minted)
        if (members.length > 1) merged++
        clusterQuads.push(df.quad(minted, RDF_TYPE, CLUSTER))
        for (const s of members) clusterQuads.push(df.quad(minted, HAS_MEMBER, df.namedNode(s)))
    }

    const originPredNode = df.namedNode(originPred)
    const seen = new Set()
    const plainQuads = []
    const provQuads  = []
    for (const qu of fedQuads) {
        const minted = mintedFor.get(qu.subject.value)
        if (!minted) continue
        const newTriple = df.quad(minted, qu.predicate, qu.object)
        const key = `${minted.value}|${qu.predicate.value}|${qu.object.termType}|${qu.object.value}`
        if (!seen.has(key)) { seen.add(key); plainQuads.push(newTriple) }
        provQuads.push(df.quad(newTriple, originPredNode, qu.subject))
    }

    console.log(`merge  ${subjects.length} entities → ${clusters.size} clusters (${merged} multi-source, ${aliasUnions} alias unions)`)

    await writeTurtle(abs(outPath), plainQuads, { ...COMMON_PREFIXES, cdf: namespace })
    console.log(`merge  wrote ${plainQuads.length} triples → ${outPath}`)

    await writeTurtle(abs(provOutPath), provQuads, {
        ...COMMON_PREFIXES, cdp: CDP, cdf: namespace, prov: "http://www.w3.org/ns/prov#",
    })
    console.log(`merge  wrote ${provQuads.length} provenance annotations → ${provOutPath}`)

    await writeTurtle(abs(clustersOutPath), clusterQuads, { cdp: CDP, cdf: namespace })
    console.log(`merge  wrote cluster log → ${clustersOutPath}`)
}

// ---- Dispatch each step -------------------------------------------------

const fedStore = newStore()

for (const iri of sorted) {
    const s = steps.get(iri)

    if (s.type === "Clean") {
        console.log(`clean  ${s.inPath} → ${s.outPath}`)
        const src   = loadDefs(s.inPath)
        const quads = await sparqlConstruct(fs.readFileSync(abs(s.query), "utf8"), [src])
        await writeTurtle(abs(s.outPath), quads, { dhs: "https://civic-data.de/dhs#" })

    } else if (s.type === "Load") {
        console.log(`load   ${s.inPath} → <${s.graph}>`)
        const graph = df.namedNode(s.graph)
        for (const quad of n3Parser.parse(fs.readFileSync(abs(s.inPath), "utf8"))) {
            fedStore.addQuad(df.quad(quad.subject, quad.predicate, quad.object, graph))
        }

    } else if (s.type === "Federate") {
        await runFederate()
        const quads = fedStore.getQuads(null, null, null, FED_GRAPH)
        await writeTurtle(abs(s.outPath), quads, { ...COMMON_PREFIXES, cdp: CDP })
        console.log(`federate  wrote ${quads.length} triples → ${s.outPath}`)

    } else if (s.type === "Merge") {
        await runMerge(fedStore, s.outPath, s.provOutPath, s.clustersOutPath)
    }
}

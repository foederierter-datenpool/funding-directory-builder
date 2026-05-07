import { newStore, parser as n3Parser, sparqlConstruct, sparqlInsertDelete, sparqlSelect, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import levenshtein from "fast-levenshtein"
import { DataFactory, Writer } from "n3"
import { createHash } from "crypto"
import { topoSort } from "./utils.js"
import path from "path"
import fs from "fs"

const df = DataFactory

const ROOT = path.join(import.meta.dirname, "..")
const abs = (p) => path.join(ROOT, p)
const defStore = storeFromTurtles(["config/federation.ttl", "config/pipeline.ttl"].map(p => fs.readFileSync(abs(p), "utf8")))

const writeTurtle = (filePath, quads, prefixes) => new Promise((resolve, reject) => {
    // Dedupe via a Store and sort by subject so the Writer can emit
    // grouped "subject p1 o1; p2 o2." blocks instead of repeating subjects.
    const store = newStore()
    for (const q of quads) store.addQuad(df.quad(q.subject, q.predicate, q.object))
    const dedup = store.getQuads(null, null, null, null)
        .sort((a, b) => a.subject.value.localeCompare(b.subject.value))
    const writer = new Writer({ prefixes })
    for (const q of dedup) writer.addQuad(q)
    writer.end((err, result) => {
        if (err) return reject(err)
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, result)
        resolve()
    })
})

// ---- Read Clean, Load, Map, Match and Merge steps -----------------------------

const rows = await sparqlSelect(`
    PREFIX :       <https://civic-data.de/pipeline#>
    PREFIX p-plan: <http://purl.org/net/p-plan#>
    SELECT ?step ?type ?cleanQuery ?graph ?inPath ?inDir ?outPath ?provOutPath ?directMappingQueries ?pred WHERE {
        ?step a ?type .
        FILTER(?type IN (:Clean, :Load, :Map, :Match, :Merge, :Resolve))
        OPTIONAL { ?step :cleanQuery           ?cleanQuery           }
        OPTIONAL { ?step :graph                ?graph                }
        OPTIONAL { ?step :input                ?inPath               }
        OPTIONAL { ?step :inputDir             ?inDir                }
        OPTIONAL { ?step :output               ?outPath              }
        OPTIONAL { ?step :provOutput           ?provOutPath          }
        OPTIONAL { ?step :directMappingQueries ?directMappingQueries }
        OPTIONAL { ?step p-plan:isPrecededBy   ?pred                 }
    }`, [defStore])

const steps = new Map()
const preds = new Map()
for (const r of rows) {
    if (!steps.has(r.step)) {
        steps.set(r.step, {
            type: r.type.split("#").pop(),
            cleanQuery: r.cleanQuery,
            graph: r.graph,
            inPath: r.inPath,
            inDir: r.inDir,
            outPath: r.outPath,
            provOutPath: r.provOutPath,
            directMappingQueries: r.directMappingQueries,
        })
        preds.set(r.step, [])
    }
    if (r.pred && !preds.get(r.step).includes(r.pred)) preds.get(r.step).push(r.pred)
}

const sorted = topoSort(steps, (iri) => preds.get(iri) ?? [])

// ---- Direct-mapping generator ------------------------------------------

const XYZ = "http://sparql.xyz/facade-x/data/"
const CDP = "https://civic-data.de/pipeline#"

const buildDirectInsert = ({ sourceGraph, source }, fields) => {
    const prefixes = {
        xyz:    XYZ,
        cdp:    CDP,
        schema: "http://schema.org/",
        foaf:   "http://xmlns.com/foaf/0.1/",
        dct:    "http://purl.org/dc/terms/",
    }
    const shortenPredicate = (iri) => {
        for (const [p, ns] of Object.entries(prefixes)) {
            if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
        }
        return `<${iri}>`
    }
    const shortenIri = (iri) => iri.startsWith(CDP) ? `cdp:${iri.slice(CDP.length)}` : `<${iri}>`

    const v      = (path) => `?${path}`
    const optLit = (subj, path) =>
        `OPTIONAL { ${subj} xyz:${path} ${v(path)} . ` +
        `FILTER(isLiteral(${v(path)}) && ${v(path)} != "") }`

    const insertBlock = fields
        .map(f => `        ?org ${shortenPredicate(f.predicate)} ${v(f.fieldPath)} .`)
        .join("\n")

    const topLevel  = fields.filter(f => !f.parentPath)
    const subFields = fields.filter(f => f.parentPath)

    // Source subjects = federation IRIs after the clean step, so ?org is
    // identified directly via cdp:fromSource — no minting from a key field.
    const bgp = [`?org cdp:fromSource ${shortenIri(source)} .`]
    for (const f of topLevel) bgp.push(optLit("?org", f.fieldPath))

    const byParent = new Map()
    for (const f of subFields) {
        if (!byParent.has(f.parentPath)) byParent.set(f.parentPath, [])
        byParent.get(f.parentPath).push(f)
    }
    let parentIdx = 0
    for (const [parent, subs] of byParent) {
        const pv    = `?_p${parentIdx++}`
        const inner = subs.map(s => `    ${optLit(pv, s.fieldPath)}`).join("\n")
        bgp.push(`OPTIONAL {\n    ?org xyz:${parent} ${pv} .\n${inner}\n  }`)
    }

    const prefixBlock = Object.entries(prefixes)
        .map(([p, ns]) => `PREFIX ${p}: <${ns}>`)
        .join("\n")

    return `${prefixBlock}

INSERT {
    GRAPH <urn:mapped> {
        ?org cdp:fromSource ${shortenIri(source)} .
${insertBlock}
    }
} WHERE {
    GRAPH <${sourceGraph}> {
        ${bgp.join("\n        ")}
    }
}`
}

const runMap = async (queriesDir) => {
    const mappings = await sparqlSelect(`
        PREFIX : <https://civic-data.de/pipeline#>
        SELECT ?mapping ?source ?sourceGraph WHERE {
            ?mapping a :Mapping ;
                :fromSource ?source .
            OPTIONAL { ?mapping :sourceGraph ?sourceGraph }
        } ORDER BY ?mapping`, [defStore])

    for (const m of mappings) {
        const directRows = await sparqlSelect(`
            PREFIX : <https://civic-data.de/pipeline#>
            SELECT ?fieldPath ?predicate ?parentPath WHERE {
                <${m.mapping}> :hasFieldMapping ?fm .
                ?fm :from ?src ; :to ?tgt .
                FILTER NOT EXISTS { ?fm :via ?_v }
                ?tgt :targetPredicate ?predicate .
                ?src :fieldPath ?fieldPath .
                OPTIONAL { ?parent :hasSubField ?src . ?parent :fieldPath ?parentPath }
            }`, [defStore])

        if (directRows.length && m.sourceGraph) {
            const localName = m.mapping.split("#").pop()
            const query = buildDirectInsert(m, directRows)
            const queryPath = abs(path.join(queriesDir, `${localName}.sparql`))
            fs.mkdirSync(path.dirname(queryPath), { recursive: true })
            fs.writeFileSync(queryPath, query)
            console.log(`map  ${localName} direct (${directRows.length} mappings) → ${queryPath}`)
            await sparqlInsertDelete(query, store)
        }

        const viaRows = await sparqlSelect(`
            PREFIX : <https://civic-data.de/pipeline#>
            SELECT DISTINCT ?script WHERE {
                <${m.mapping}> :hasFieldMapping ?fm .
                ?fm :via ?via .
                ?via :script ?script .
            } ORDER BY ?script`, [defStore])

        for (const v of viaRows) {
            console.log(`map  ${v.script}`)
            await sparqlInsertDelete(fs.readFileSync(abs(v.script), "utf8"), store)
        }
    }
}

// ---- Shared graphs and prefixes ----------------------------------------

const MAPPED_GRAPH = df.namedNode("urn:mapped")
const MATCH_GRAPH  = df.namedNode("urn:matched")
const MERGED_GRAPH = df.namedNode("urn:merged")

const HAS_MEMBER = df.namedNode(CDP + "hasMember")

const COMMON_PREFIXES = {
    schema: "http://schema.org/",
    foaf:   "http://xmlns.com/foaf/0.1/",
    dct:    "http://purl.org/dc/terms/",
}

// ---- Match -------------------------------------------------------------

const RDF_TYPE      = df.namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
const MATCH_CLUSTER = df.namedNode(CDP + "MatchCluster")

const norm = (s) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
const similarity = (a, b) => {
    const an = norm(a), bn = norm(b)
    const maxLen = Math.max(an.length, bn.length)
    if (maxLen === 0) return 1
    return 1 - levenshtein.get(an, bn) / maxLen
}

const runMatch = async (store, outPath) => {
    const [cfg] = await sparqlSelect(`
        PREFIX : <https://civic-data.de/pipeline#>
        SELECT ?ns ?prefix ?manualMatchesGraph WHERE {
            ?match a :MatchRule ;
                :targetNamespace     ?ns ;
                :mintedSubjectPrefix ?prefix .
            OPTIONAL { ?match :manualMatchesGraph ?manualMatchesGraph }
        }`, [defStore])
    if (!cfg) throw new Error(":MatchRule config missing in federation.ttl")
    const { ns: namespace, prefix: mintedPrefix, manualMatchesGraph } = cfg

    const criteriaRows = await sparqlSelect(`
        PREFIX : <https://civic-data.de/pipeline#>
        SELECT ?on ?minSim WHERE {
            ?match a :MatchRule ; :hasMatchCriterion ?c .
            ?c :on ?on ; :minSimilarity ?minSim .
        }`, [defStore])
    const criteria = criteriaRows.map(r => ({
        pred:   df.namedNode(r.on),
        minSim: parseFloat(r.minSim),
    }))

    const fedQuads = store.getQuads(null, null, null, MAPPED_GRAPH)
    const subjects = [...new Set(fedQuads
        .filter(qu => qu.subject.termType === "NamedNode")
        .map(qu => qu.subject.value))]

    const valuesFor = new Map()
    for (const s of subjects) {
        const subj = df.namedNode(s)
        valuesFor.set(s, criteria.map(c => {
            const qs = store.getQuads(subj, c.pred, null, MAPPED_GRAPH)
            return qs.length ? qs[0].object.value : null
        }))
    }

    const matches = (a, b) => {
        const va = valuesFor.get(a), vb = valuesFor.get(b)
        const scores = []
        for (let i = 0; i < criteria.length; i++) {
            if (va[i] == null || vb[i] == null) return null
            const sim = similarity(va[i], vb[i])
            if (sim < criteria[i].minSim) return null
            scores.push({ pred: criteria[i].pred, sim })
        }
        return scores
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

    const evidence = []
    let sameAsUnions = 0
    if (manualMatchesGraph) {
        const OWL_SAME_AS = "http://www.w3.org/2002/07/owl#sameAs"
        const manualMatchQuads = n3Parser.parse(fs.readFileSync(abs(manualMatchesGraph), "utf8"))
        for (const qu of manualMatchQuads) {
            if (qu.predicate.value !== OWL_SAME_AS) continue
            const a = qu.subject.value, b = qu.object.value
            if (parent.has(a) && parent.has(b)) { union(a, b); sameAsUnions++; evidence.push({ a, b, manual: true }) }
        }
    }

    for (let i = 0; i < subjects.length; i++) {
        for (let j = i + 1; j < subjects.length; j++) {
            const scores = matches(subjects[i], subjects[j])
            if (scores) { union(subjects[i], subjects[j]); evidence.push({ a: subjects[i], b: subjects[j], scores }) }
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

    let multiSource = 0
    const clusterIriByRoot = new Map()
    for (const members of clusterMembers) {
        const id = createHash("sha1").update(members.join("|")).digest("hex").slice(0, 12)
        const minted = df.namedNode(namespace + mintedPrefix + id)
        clusterIriByRoot.set(find(members[0]), minted)
        if (members.length > 1) multiSource++
        store.addQuad(df.quad(minted, RDF_TYPE, MATCH_CLUSTER, MATCH_GRAPH))
        for (const s of members) {
            store.addQuad(df.quad(minted, HAS_MEMBER, df.namedNode(s), MATCH_GRAPH))
        }
    }

    const MATCH_EVIDENCE     = df.namedNode(CDP + "MatchEvidence")
    const HAS_MATCH_EVIDENCE = df.namedNode(CDP + "hasMatchEvidence")
    const PAIR               = df.namedNode(CDP + "pair")
    const ON_CRITERION       = df.namedNode(CDP + "onCriterion")
    const ON                 = df.namedNode(CDP + "on")
    const SIMILARITY         = df.namedNode(CDP + "similarity")
    const VIA_MANUAL_MATCH   = df.namedNode(CDP + "viaManualMatch")
    const XSD_DECIMAL        = df.namedNode("http://www.w3.org/2001/XMLSchema#decimal")
    const XSD_BOOLEAN        = df.namedNode("http://www.w3.org/2001/XMLSchema#boolean")
    for (const ev of evidence) {
        const evNode = df.blankNode()
        const cluster = clusterIriByRoot.get(find(ev.a))
        store.addQuad(df.quad(cluster, HAS_MATCH_EVIDENCE, evNode, MATCH_GRAPH))
        store.addQuad(df.quad(evNode, RDF_TYPE, MATCH_EVIDENCE, MATCH_GRAPH))
        store.addQuad(df.quad(evNode, PAIR, df.namedNode(ev.a), MATCH_GRAPH))
        store.addQuad(df.quad(evNode, PAIR, df.namedNode(ev.b), MATCH_GRAPH))
        if (ev.manual) {
            store.addQuad(df.quad(evNode, VIA_MANUAL_MATCH, df.literal("true", XSD_BOOLEAN), MATCH_GRAPH))
        } else {
            for (const s of ev.scores) {
                const cNode = df.blankNode()
                store.addQuad(df.quad(evNode, ON_CRITERION, cNode, MATCH_GRAPH))
                store.addQuad(df.quad(cNode, ON, s.pred, MATCH_GRAPH))
                store.addQuad(df.quad(cNode, SIMILARITY, df.literal(s.sim.toFixed(3), XSD_DECIMAL), MATCH_GRAPH))
            }
        }
    }

    const matchQuads = store.getQuads(null, null, null, MATCH_GRAPH)

    console.log(`match: ${subjects.length} entities → ${clusters.size} clusters (${multiSource} multi-source, ${sameAsUnions} sameAs unions)`)

    await writeTurtle(abs(outPath), matchQuads, { cdp: CDP, cdf: namespace, ...COMMON_PREFIXES })
    console.log(`match: wrote cluster log → ${outPath}`)
}

// ---- Merge -------------------------------------------------------------

const runMerge = async (store, outPath, provOutPath) => {
    const [cfg] = await sparqlSelect(`
        PREFIX : <https://civic-data.de/pipeline#>
        SELECT ?ns ?originPred WHERE {
            ?match a :MatchRule ; :targetNamespace ?ns .
            ?merge a :MergeRule ; :originPredicate ?originPred .
        }`, [defStore])
    if (!cfg) throw new Error(":MergeRule / :MatchRule config missing in federation.ttl")
    const { ns: namespace, originPred } = cfg

    const memberQuads = store.getQuads(null, HAS_MEMBER, null, MATCH_GRAPH)
    const mintedFor = new Map()
    for (const mq of memberQuads) mintedFor.set(mq.object.value, mq.subject)

    const fedQuads = store.getQuads(null, null, null, MAPPED_GRAPH)
    const originPredNode = df.namedNode(originPred)
    const provQuads = []
    for (const qu of fedQuads) {
        const minted = mintedFor.get(qu.subject.value)
        if (!minted) continue
        store.addQuad(df.quad(minted, qu.predicate, qu.object, MERGED_GRAPH))
        const triple = df.quad(minted, qu.predicate, qu.object)
        provQuads.push(df.quad(triple, originPredNode, qu.subject))
    }

    const mergedQuads = store.getQuads(null, null, null, MERGED_GRAPH)

    await writeTurtle(abs(outPath), mergedQuads, { ...COMMON_PREFIXES, cdp: CDP, cdf: namespace })
    console.log(`merge: wrote ${mergedQuads.length} triples → ${outPath}`)

    await writeTurtle(abs(provOutPath), provQuads, {
        ...COMMON_PREFIXES, cdp: CDP, cdf: namespace, prov: "http://www.w3.org/ns/prov#",
    })
    console.log(`merge: wrote ${provQuads.length} provenance annotations → ${provOutPath}`)
}

// ---- Resolve -----------------------------------------------------------

// One value per (subject, predicate). schema:identifier and cdp:fromSource
// are dropped — final.ttl is the consumer-facing artifact, source attribution
// lives in provenance.ttl.
const STRATEGIES = {
    alphabeticFirst: (quads) => [...quads].sort((a, b) => a.object.value.localeCompare(b.object.value))[0],
    concatenateAll:  (quads) => df.quad(quads[0].subject, quads[0].predicate,
        df.literal([...new Set(quads.map(q => q.object.value))].sort().join(", "))),
}
const RESOLVE_EXCLUDE = new Set(["http://schema.org/identifier", `${CDP}fromSource`])

const lookupStrategy = (iri) => {
    const fn = STRATEGIES[iri.split("#").pop()]
    if (!fn) throw new Error(`Unknown resolve strategy ${iri}`)
    return fn
}

const runResolve = async (store, outPath) => {
    const [cfg] = await sparqlSelect(`
        PREFIX : <https://civic-data.de/pipeline#>
        SELECT ?strategy ?ns WHERE {
            ?resolve a :ResolveRule ; :defaultStrategy ?strategy .
            ?match   a :MatchRule   ; :targetNamespace ?ns .
        }`, [defStore])
    if (!cfg) throw new Error(":ResolveRule config missing in federation.ttl")
    const defaultPick = lookupStrategy(cfg.strategy)

    const overrideRows = await sparqlSelect(`
        PREFIX : <https://civic-data.de/pipeline#>
        SELECT ?on ?strategy WHERE {
            ?resolve a :ResolveRule ; :hasOverride [ :on ?on ; :strategy ?strategy ] .
        }`, [defStore])
    const overrides = new Map(overrideRows.map(r => [r.on, lookupStrategy(r.strategy)]))

    const groups = new Map()
    for (const q of store.getQuads(null, null, null, MERGED_GRAPH)) {
        if (RESOLVE_EXCLUDE.has(q.predicate.value)) continue
        const k = `${q.subject.value}\t${q.predicate.value}`
        if (!groups.has(k)) groups.set(k, [])
        groups.get(k).push(q)
    }
    const finalQuads = [...groups.values()].map(quads =>
        (overrides.get(quads[0].predicate.value) ?? defaultPick)(quads))

    await writeTurtle(abs(outPath), finalQuads, { ...COMMON_PREFIXES, cdf: cfg.ns })
    console.log(`resolve: wrote ${finalQuads.length} triples → ${outPath}`)
}

// ---- Dispatch each step -------------------------------------------------

const store = newStore()

for (const iri of sorted) {
    const s = steps.get(iri)

    if (s.type === "Clean") {
        const cleanQuery = fs.readFileSync(abs(s.cleanQuery), "utf8")
        let ttls
        if (s.inDir) {
            // Run CONSTRUCT per file so each lifted TTL stays isolated in its
            // own store — the clean SPARQL can't cross-join across documents.
            const inAbs = abs(s.inDir)
            const files = fs.readdirSync(inAbs).filter(f => f.endsWith(".ttl")).sort()
            ttls = files.map(f => fs.readFileSync(path.join(inAbs, f), "utf8"))
            console.log(`clean  ${s.inDir} (${ttls.length} files) → ${s.outPath}`)
        } else {
            ttls = [fs.readFileSync(abs(s.inPath), "utf8")]
            console.log(`clean  ${s.inPath} → ${s.outPath}`)
        }
        const allQuads = []
        for (const ttl of ttls) {
            const src = storeFromTurtles([ttl])
            allQuads.push(...await sparqlConstruct(cleanQuery, [src]))
        }
        await writeTurtle(abs(s.outPath), allQuads, {
            xyz: "http://sparql.xyz/facade-x/data/",
            cdp: "https://civic-data.de/pipeline#",
        })

    } else if (s.type === "Load") {
        console.log(`load   ${s.inPath} → <${s.graph}>`)
        const graph = df.namedNode(s.graph)
        for (const quad of n3Parser.parse(fs.readFileSync(abs(s.inPath), "utf8"))) {
            store.addQuad(df.quad(quad.subject, quad.predicate, quad.object, graph))
        }

    } else if (s.type === "Map") {
        await runMap(s.directMappingQueries)
        const quads = store.getQuads(null, null, null, MAPPED_GRAPH)
        await writeTurtle(abs(s.outPath), quads, { ...COMMON_PREFIXES, cdp: CDP })
        console.log(`map: wrote ${quads.length} triples → ${s.outPath}`)

    } else if (s.type === "Match") {
        await runMatch(store, s.outPath)

    } else if (s.type === "Merge") {
        await runMerge(store, s.outPath, s.provOutPath)

    } else if (s.type === "Resolve") {
        await runResolve(store, s.outPath)
    }
}

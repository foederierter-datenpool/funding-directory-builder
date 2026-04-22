import { newStore, parser as n3Parser, sparqlConstruct, sparqlInsertDelete } from "@foerderfunke/sem-ops-utils"
import { abs, stepNum, loadDefs, makeQ } from "./pipeline-utils.js"
import { DataFactory, Writer } from "n3"
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

// ---- Read pipeline output path and Clean/Load/Federate steps ------------

const [{ output }] = await q("SELECT ?output WHERE { :pipeline :finalOutput ?output }")

const rows = await q(`
    SELECT ?step ?type ?query ?graph ?inPath ?outPath WHERE {
        ?step a ?type .
        FILTER(?type IN (:Clean, :Load, :Federate))
        OPTIONAL { ?step :query  ?query  }
        OPTIONAL { ?step :graph  ?graph  }
        OPTIONAL { ?step :input  ?inPath }
        OPTIONAL { ?step :output ?outPath }
    }`)

const steps = new Map()
for (const r of rows) {
    if (!steps.has(r.step)) {
        steps.set(r.step, {
            type: r.type.split("#").pop(),
            query: r.query, graph: r.graph,
            inPath: r.inPath, outPath: r.outPath,
        })
    }
}

const sorted = [...steps.keys()].sort((a, b) => stepNum(a) - stepNum(b))

// ---- Direct-mapping generator ------------------------------------------

const XYZ = "http://sparql.xyz/facade-x/data/"
const CDF = "https://civic-data.de/federated-directory#"

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
    BIND(IRI(CONCAT("${CDF}", "${subjectPrefix}", STR(${v(subjectFromPath)}))) AS ?fedIri)
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
    }
}

// ---- Write output -------------------------------------------------------

const quads = fedStore.getQuads(null, null, null, df.namedNode("urn:federated"))
await writeTurtle(abs(output), quads, {
    schema: "http://schema.org/",
    locn:   "http://www.w3.org/ns/locn#",
    foaf:   "http://xmlns.com/foaf/0.1/",
    dct:    "http://purl.org/dc/terms/",
    cdf:    "https://civic-data.de/federated-directory#",
})
console.log(`\nwrote ${quads.length} triples → ${output}`)

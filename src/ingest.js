import { sparqlSelect, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import { spawnSync } from "child_process"
import path from "path"
import fs from "fs"

const ROOT = path.join(import.meta.dirname, "..")
const JAR = path.join(ROOT, "tools/sparql-anything.jar")
const abs = (p) => path.join(ROOT, p)
const stepNum = (iri) => parseInt(iri.split("#step").pop(), 10)
const defStore = storeFromTurtles(["config/pipeline.ttl"].map(p => fs.readFileSync(abs(p), "utf8")))

const run = (cmd, args) => {
    const r = spawnSync(cmd, args, { stdio: "inherit" })
    if (r.status !== 0) throw new Error(`Exit ${r.status}: ${cmd} ${args.join(" ")}`)
}

// ---- Read Fetch and Lift steps --------------------------------------------

const rows = await sparqlSelect(`
    PREFIX : <https://civic-data.de/pipeline#>
    SELECT ?step ?type ?script ?fetchUrl ?liftQuery ?inPath ?outPath ?fromSource ?paramName ?paramValue WHERE {
        ?step a ?type .
        FILTER(?type IN (:Fetch, :Lift))
        OPTIONAL { ?step :script     ?script     }
        OPTIONAL { ?step :fetchUrl   ?fetchUrl   }
        OPTIONAL { ?step :liftQuery  ?liftQuery  }
        OPTIONAL { ?step :input      ?inPath     }
        OPTIONAL { ?step :output     ?outPath    }
        OPTIONAL { ?step :fromSource ?fromSource }
        OPTIONAL { ?step :param [ :name ?paramName ; :value ?paramValue ] }
    }`, [defStore])

const steps = new Map()
for (const r of rows) {
    if (!steps.has(r.step)) {
        steps.set(r.step, {
            type: r.type.split("#").pop(),
            script: r.script, fetchUrl: r.fetchUrl, liftQuery: r.liftQuery,
            inPath: r.inPath, outPath: r.outPath, fromSource: r.fromSource,
            params: [],
        })
    }
    if (r.paramName) steps.get(r.step).params.push([r.paramName, r.paramValue])
}

const sorted = [...steps.keys()].sort((a, b) => stepNum(a) - stepNum(b))

// ---- Ensure sparql-anything.jar ----------------------------------------

const SPARQL_ANYTHING_VERSION = "v1.1.0"
const VERSION_FILE = path.join(ROOT, "tools/sparql-anything.version")
const haveCurrentJar = fs.existsSync(JAR) && fs.existsSync(VERSION_FILE)
    && fs.readFileSync(VERSION_FILE, "utf8").trim() === SPARQL_ANYTHING_VERSION

if (!haveCurrentJar) {
    const url = `https://github.com/SPARQL-Anything/sparql.anything/releases/download/${SPARQL_ANYTHING_VERSION}/sparql-anything-${SPARQL_ANYTHING_VERSION}.jar`
    console.log(`Downloading sparql-anything ${SPARQL_ANYTHING_VERSION}...`)
    fs.mkdirSync(path.dirname(JAR), { recursive: true })
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`)
    fs.writeFileSync(JAR, Buffer.from(await response.arrayBuffer()))
    fs.writeFileSync(VERSION_FILE, SPARQL_ANYTHING_VERSION)
    console.log(`Saved to ${JAR}`)
}

// ---- Run steps ----------------------------------------------------------

const NS = "https://civic-data.de/pipeline#"
const [{ logPath: LOG_PATH }] = await sparqlSelect(`
    PREFIX : <${NS}>
    SELECT ?logPath WHERE { :pipeline :ingestLog ?logPath }`, [defStore])

const runStart = new Date()
const harvests = []

for (const iri of sorted) {
    const s = steps.get(iri)

    if (s.type === "Fetch") {
        console.log(`fetch  ${s.fetchUrl} → ${s.outPath}`)
        fs.mkdirSync(path.dirname(abs(s.outPath)), { recursive: true })
        run("node", [abs(s.script), abs(s.outPath), s.fetchUrl])
        if (s.fromSource) harvests.push({ source: s.fromSource, time: new Date().toISOString() })

    } else if (s.type === "Lift") {
        console.log(`lift   ${s.inPath} → ${s.outPath}`)
        const args = ["-jar", JAR, "-q", abs(s.liftQuery),
                      "-v", `location=${abs(s.inPath)}`,
                      "-f", "TTL", "-o", abs(s.outPath)]
        for (const [name, value] of s.params) args.push("-v", `${name}=${value}`)
        fs.mkdirSync(path.dirname(abs(s.outPath)), { recursive: true })
        run("java", args)
    }
}

const dt = (s) => `"${s}"^^xsd:dateTime`
const runId = "run" + runStart.toISOString().replace(/\D/g, "").slice(0, 14)
const harvestPart = harvests.length
    ? ` ;\n    :harvested\n` + harvests.map((h) => {
        const local = h.source.split("#").pop()
        return `        [ :ofSource :${local} ; prov:atTime ${dt(h.time)} ]`
    }).join(" ,\n")
    : ""

const block = `
:${runId} a :IngestRun ;
    prov:startedAtTime ${dt(runStart.toISOString())} ;
    prov:endedAtTime   ${dt(new Date().toISOString())}${harvestPart} .
`

const prefixes = `@prefix :    <${NS}> .
@prefix prov: <http://www.w3.org/ns/prov#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
`
fs.mkdirSync(path.dirname(abs(LOG_PATH)), { recursive: true })
fs.writeFileSync(abs(LOG_PATH), prefixes + block)
console.log(`log:   wrote IngestRun → ${LOG_PATH}`)

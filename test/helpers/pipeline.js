// Run the engine's lift + extract steps against a frozen fixture, offline.
//
// The engine does not export runLift/runExtract, so this mirrors them: lift is a
// java invocation of the bundled SPARQL Anything query for the source's :format
// (identical arguments to src/pipeline/steps/lift.js), extract is the source's
// own extract.sparql run over a store holding just that one lifted document —
// which is also how the real step scopes it, one isolated store per file.
//
// Deliberately starts from raw bytes rather than from lifted records: a source's
// fetch.js can carry real logic (fdbBund parses CSV and decodes JSON-in-cell),
// and a fixture that entered after fetch would not exercise it. Anything a
// fetch.js does beyond transport gets its own unit test alongside.

import { sparqlConstruct, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import { execFileSync } from "child_process"
import path from "path"
import os from "os"
import fs from "fs"

const ROOT = path.join(import.meta.dirname, "../..")
const CORE = path.join(ROOT, "node_modules/@directory-builder/core")
const JAR = path.join(ROOT, "tools/sparql-anything.jar")

// :format → the bundled lift query, and the lift params federation.ttl declares.
// Kept here rather than parsed out of the config: a test that read the config
// would follow it into a broken state instead of failing.
const SOURCES = {
    dsee:          { lift: "html", params: { selector: "html" } },
    fdbBund:       { lift: "json", params: {} },
    euportal:      { lift: "json", params: {} },
    foerderfinder: { lift: "json", params: {} },
}

// The engine downloads and caches the jar in ensureJar(), but that lives behind
// core's "." / "./utils" exports map and cannot be imported. So this mirrors it,
// reading the pinned version out of the engine's own source rather than
// duplicating the constant — a version bump upstream would otherwise leave the
// tests silently on an older triplifier than the pipeline uses.
const jarVersion = () => {
    const src = fs.readFileSync(path.join(CORE, "src/pipeline/steps/lift.js"), "utf8")
    const m = src.match(/SPARQL_ANYTHING_VERSION\s*=\s*"([^"]+)"/)
    if (!m) throw new Error("could not read SPARQL_ANYTHING_VERSION from the engine's lift step")
    return m[1]
}

const ensureJar = async () => {
    const version = jarVersion()
    const stamp = path.join(ROOT, "tools/sparql-anything.version")
    const current = fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8").trim() === version
    if (fs.existsSync(JAR) && current) return
    const url = `https://github.com/SPARQL-Anything/sparql.anything/releases/download/${version}/sparql-anything-${version}.jar`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`could not download ${url}: ${res.status}`)
    fs.mkdirSync(path.dirname(JAR), { recursive: true })
    fs.writeFileSync(JAR, Buffer.from(await res.arrayBuffer()))
    fs.writeFileSync(stamp, version)
}

export const lift = (source, fixturePath) => {
    const { lift: format, params } = SOURCES[source]
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fdb-test-")), "lifted.ttl")
    const args = ["-jar", JAR,
        "-q", path.join(CORE, "src/lift", `${format}.sparql`),
        "-v", `location=${path.resolve(fixturePath)}`,
        "-f", "TTL", "-o", out]
    for (const [k, v] of Object.entries(params)) args.push("-v", `${k}=${v}`)
    execFileSync("java", args, { stdio: ["ignore", "ignore", "pipe"] })
    return fs.readFileSync(out, "utf8")
}

export const extract = async (source, liftedTtl) => {
    const query = fs.readFileSync(path.join(ROOT, "sources", source, "extract.sparql"), "utf8")
    return sparqlConstruct(query, [storeFromTurtles([liftedTtl])])
}

// Sorted N-Triples. A golden file is only signal if the serialisation is stable;
// sorting the lines removes any dependence on statement order. The engine's own
// writer already dedupes and sorts by subject, so this matches its guarantees.
export const canonical = (quads) => {
    const term = (t) => t.termType === "Literal"
        ? JSON.stringify(t.value) + (t.language ? `@${t.language}`
            : t.datatype && t.datatype.value !== "http://www.w3.org/2001/XMLSchema#string"
                ? `^^<${t.datatype.value}>` : "")
        : `<${t.value}>`
    return [...new Set(quads.map((q) => `${term(q.subject)} <${q.predicate.value}> ${term(q.object)} .`))]
        .sort().join("\n") + "\n"
}

export const run = async (source, fixturePath) => {
    await ensureJar()
    return canonical(await extract(source, lift(source, fixturePath)))
}

import { spawnSync } from "child_process"
import path from "path"
import fs from "fs"

const ROOT = path.join(import.meta.dirname, "..")
const JAR = path.join(ROOT, "tools/sparql-anything.jar")
const SOURCES_DIR = path.join(ROOT, "sources")

const LIFT_QUERIES = {
    ".html": path.join(SOURCES_DIR, "lift-html.sparql"),
    ".json": path.join(SOURCES_DIR, "lift-json.sparql"),
}

// Per-source HTML selectors passed into lift-html.sparql as ?_selector.
// TODO: move to pipeline.ttl
const HTML_SELECTORS = {
    dhs: "ul.results",
}

function run(cmd, args) {
    const result = spawnSync(cmd, args, { stdio: "inherit" })
    if (result.status !== 0) {
        throw new Error(`Exit ${result.status}: ${cmd} ${args.join(" ")}`)
    }
}

if (!fs.existsSync(JAR)) {
    run("bash", [path.join(ROOT, "scripts/download-sparql-anything.sh")])
}

for (const name of fs.readdirSync(SOURCES_DIR)) {
    const sourceDir = path.join(SOURCES_DIR, name)
    if (!fs.statSync(sourceDir).isDirectory()) continue

    const fetchScript = path.join(sourceDir, "fetch.js")
    if (fs.existsSync(fetchScript)) {
        console.log(`\n== ${name}: fetching ==`)
        run("node", [fetchScript])
    }

    const rawDir = path.join(sourceDir, "raw")
    const raw = Object.entries(LIFT_QUERIES)
        .map(([ext, query]) => ({ ext, query, file: path.join(rawDir, `${name}${ext}`) }))
        .find(({ file }) => fs.existsSync(file))
    if (!raw) {
        console.log(`== ${name}: no liftable raw file, skipping ==`)
        continue
    }

    const liftedDir = path.join(sourceDir, "lifted")
    fs.mkdirSync(liftedDir, { recursive: true })
    const out = path.join(liftedDir, `${name}.ttl`)

    const args = [
        "-jar", JAR,
        "-q", raw.query,
        "-v", `location=${raw.file}`,
        "-f", "TTL",
        "-o", out,
    ]
    if (raw.ext === ".html") {
        const selector = HTML_SELECTORS[name]
        if (!selector) throw new Error(`No HTML selector configured for ${name}`)
        args.push("-v", `selector=${selector}`)
    }

    console.log(`== ${name}: lifting ${path.basename(raw.file)} -> ${path.relative(ROOT, out)} ==`)
    run("java", args)
}

console.log("\nDone")

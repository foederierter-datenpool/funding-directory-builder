// Fill rates per declared source field, measured over data/pipeline/extracted/.
//
// The engine's own drift check (validate.js) already fails when a mapped :fieldPath
// is entirely absent from the extracted output. It is binary, and that is the gap
// this fills: a field whose fill rate collapses from 90% to 2% — an upstream key
// renamed on most records but not all, a selector that stops matching one page
// variant — passes the drift check untouched.
//
//   node test/coverage.js            print the table
//   node test/coverage.js --update   rewrite the committed baseline
//
// Intended to move upstream as *rates added to the existing drift check*, not as a
// second report; see test-plan.md. Prototyped here first so the shape is known
// before it becomes engine API.

import { parseTtl, PATHS, sourceName } from "@directory-builder/core/utils"
import path from "path"
import fs from "fs"

const ROOT = path.join(import.meta.dirname, "..")
const BASELINE = path.join(import.meta.dirname, "coverage-baseline.json")
const CDP = "https://civic-data.de/pipeline#"
const XYZ = "http://sparql.xyz/facade-x/data/"
// How far a field may fall below its baseline before this is treated as a defect.
// Absolute percentage points, so a small field is not flagged for rounding.
const TOLERANCE = 5

const fed = parseTtl(fs.readFileSync(path.join(ROOT, PATHS.federation), "utf8"))
const lit = (s, p) => fed.find((q) => q.subject.value === s && q.predicate.value === CDP + p)?.object.value
const objs = (s, p) => fed.filter((q) => q.subject.value === s && q.predicate.value === CDP + p).map((q) => q.object.value)

export function measure() {
    const out = {}
    for (const src of objs(CDP + "federation", "hasSource")) {
        const name = sourceName(src)
        const file = path.join(ROOT, PATHS.extracted(name))
        if (!fs.existsSync(file)) continue
        const quads = parseTtl(fs.readFileSync(file, "utf8"))
        // One entity per subject carrying cdp:fromSource — the marker every extract
        // emits, and the same thing the map step keys on.
        const entities = new Set(quads.filter((q) => q.predicate.value === CDP + "fromSource").map((q) => q.subject.value))
        const filled = {}
        for (const q of quads) {
            if (!q.predicate.value.startsWith(XYZ)) continue
            if (q.object.termType !== "Literal" || !q.object.value.trim()) continue
            const f = q.predicate.value.slice(XYZ.length);
            (filled[f] ??= new Set()).add(q.subject.value)
        }
        const fields = {}
        for (const f of objs(src, "hasField")) {
            const p = lit(f, "fieldPath")
            if (p) fields[p] = filled[p]?.size ?? 0
        }
        out[name] = { records: entities.size, fields }
    }
    return out
}

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0)

export function compare(now, base) {
    const problems = []
    for (const [src, { records, fields }] of Object.entries(now)) {
        for (const [field, count] of Object.entries(fields)) {
            const rate = pct(count, records)
            if (count === 0) { problems.push(`${src}.${field}: 0% filled (${records} records)`); continue }
            const was = base?.[src]?.fields?.[field]
            if (was === undefined) continue
            const wasRate = pct(was, base[src].records)
            if (wasRate - rate > TOLERANCE) problems.push(`${src}.${field}: ${wasRate}% → ${rate}%`)
        }
        for (const field of Object.keys(base?.[src]?.fields ?? {})) {
            if (!(field in fields)) problems.push(`${src}.${field}: was measured before, no longer declared`)
        }
    }
    for (const src of Object.keys(base ?? {})) if (!(src in now)) problems.push(`${src}: no extracted output`)
    return problems
}

if (process.argv[1] === import.meta.filename) {
    const now = measure()
    if (process.argv.includes("--update")) {
        fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n")
        console.log(`baseline written → ${path.relative(ROOT, BASELINE)}`)
    }
    for (const [src, { records, fields }] of Object.entries(now)) {
        console.log(`\n${src}  (${records} records)`)
        for (const [f, c] of Object.entries(fields)) {
            const r = pct(c, records)
            console.log(`   ${r === 0 ? "!" : " "} ${String(r).padStart(3)}%  ${String(c).padStart(4)}  ${f}`)
        }
    }
    const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null
    const problems = compare(now, base)
    if (problems.length) { console.error("\n" + problems.map((p) => `  ${p}`).join("\n")); process.exitCode = 1 }
}

// Turn pasted adjudication verdicts into config/curation.ttl.
//
//   node scripts/curation/apply-verdicts.mjs verdicts.txt
//
// Input is one line per pair, as the prompt asks for:
//   16 DIFFERENT one commits to Sachsen-Anhalt for 3 years, the other rural for 5
//
// SAME      -> owl:sameAs        (forces a merge the score missed)
// DIFFERENT -> owl:differentFrom (vetoes a merge the score made)
// UNSURE    -> written as a comment only, so it shows up in review and changes
//              nothing. A judgement nobody made must not silently become one.
//
// Only pairs whose verdict *disagrees* with what the threshold already does are
// emitted. Restating an agreement would grow the file with assertions that do
// nothing and hide the ones that matter in a diff.
import fs from "fs"

const MIN_SCORE = 85   // keep in step with :minScore in config/federation.ttl
const pairs = new Map(JSON.parse(fs.readFileSync("data/curation/judge-pairs.json", "utf8")).map(p => [p.id, p]))
const lines = fs.readFileSync(process.argv[2], "utf8").split("\n")

const verdicts = []
for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s+(SAME|DIFFERENT|UNSURE)\b\s*(.*)$/i)
    if (!m) continue
    const pair = pairs.get(Number(m[1]))
    if (!pair) { console.warn(`  no pair ${m[1]}, skipped`); continue }
    verdicts.push({ ...pair, verdict: m[2].toUpperCase(), reason: m[3].trim() })
}
const missing = [...pairs.keys()].filter(id => !verdicts.some(v => v.id === id))
if (missing.length) console.warn(`  ${missing.length} pair(s) without a verdict: ${missing.join(", ")}`)

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
const out = [
    "# Curated adjudications of candidate merges that title similarity cannot decide.",
    "# Generated from data/curation/judge-prompt.txt — regenerate and re-adjudicate",
    "# rather than editing by hand, then review this diff.",
    "#",
    "# Only disagreements with the threshold are asserted: a SAME below :minScore,",
    "# or a DIFFERENT above it. Agreements are left implicit.",
    "",
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
    "@prefix cdp: <https://civic-data.de/pipeline#> .",
    "",
]
let emitted = 0, noop = 0
for (const v of verdicts.sort((a, b) => a.id - b.id)) {
    const wouldMerge = v.score >= MIN_SCORE
    if (v.verdict === "UNSURE") {
        out.push(`# UNSURE (${v.score}) ${v.a} / ${v.b}`, `#   ${v.reason}`, "")
        continue
    }
    const wants = v.verdict === "SAME"
    if (wants === wouldMerge) { noop++; continue }
    out.push(`# ${v.verdict} (${v.score}) — ${v.reason || "no reason given"}`,
             `#   ${v.an}`, `#   ${v.bn}`,
             `${v.a} ${wants ? "owl:sameAs" : "owl:differentFrom"} ${v.b} .`, "")
    emitted++
}
fs.writeFileSync("config/curation.ttl", out.join("\n"))
console.log(`${verdicts.length} verdicts → ${emitted} assertion(s), ${noop} agreeing with the threshold (not written)`)
console.log("wrote config/curation.ttl")

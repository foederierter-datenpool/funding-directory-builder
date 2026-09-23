// Cross-check the adjudicated verdicts against evidence the adjudication did not use.
//
//   npm run curate:review config/curation-verdicts.txt
//
// The judge saw titles, descriptions and regions. The mapped graph also carries
// funding area, funding type, eligible applicant and funder level. Those are a
// weak but independent signal: two records of the same programme should mostly
// agree on them, and two different programmes usually will not.
//
// This does not decide anything. It ranks the verdicts by how much the
// independent evidence argues against them, so a reviewer reads the handful worth
// arguing about instead of all 47.
//
// KNOWN LIMIT, and it is the main finding of writing this: the categorical fields
// are not yet comparable across sources, so most of what it flags is vocabulary
// drift rather than a bad verdict.
//
//   - DSEE's fundingArea is its own Engagementbereiche axis, not the XOeV
//     Foerderbereich the others crosswalk to. Excluded below, or every true DSEE
//     merge is flagged.
//   - fdbBund and Foerderfinder disagree on slugs for the same concept:
//     verband_vereinigung against verbaende, zuschuss against
//     anteilsfinanzierung_kapitalbeteiligung.
//
// Reconciling those is config/vocab.ttl, roadmap item 10. Until it exists this
// check is a weak prior, not a verdict test -- and the temptation to keep excluding
// fields until only the already-doubted verdicts remain would turn it into a check
// that confirms whatever it is pointed at.
import fs from "fs"

// Written as full IRIs, not cdf:. write-turtle.js only abbreviates the prefixes it
// declares, and cdf is not one of them -- a cdf: pattern matches nothing here and
// the check silently compares zero fields, which is how the first version of this
// script "passed" on all 47 verdicts.
const CDF = "https://civic-data.de/federated-directory#"
const FIELDS = ["fundingArea", "fundingType", "eligibleApplicant", "funderLevel"]

const values = (block, field) => {
    const raw = block.match(new RegExp(`<${CDF}${field}>\\s+(.*?)(?=\\s*[;.]\\s*(?:\\n|$))`, "s"))?.[1] ?? ""
    return new Set([...raw.matchAll(/<([^>]+)>|"((?:[^"\\]|\\.)*)"/g)].map(m => m[1] ?? m[2]))
}

const blocks = new Map()
for (const b of fs.readFileSync("data/pipeline/mapped.ttl", "utf8").split(/\n(?=cdp:)/)) {
    const iri = b.match(/^(cdp:[\w-]+)/)?.[1]
    if (iri) blocks.set(iri, b)
}

const pairs = new Map(JSON.parse(fs.readFileSync("data/curation/judge-pairs.json", "utf8")).map(p => [p.id, p]))
const rows = []
for (const line of fs.readFileSync(process.argv[2], "utf8").split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(SAME|DIFFERENT|UNSURE)\b\s*(.*)$/i)
    if (!m) continue
    const p = pairs.get(Number(m[1]))
    if (!p) continue
    const A = blocks.get(p.a), B = blocks.get(p.b)
    let agree = 0, conflict = 0, comparable = 0
    const detail = []
    const src = (iri) => iri.match(/^cdp:(fdb|dsee|eu|ff)-/)?.[1]
    for (const f of FIELDS) {
        // DSEE's fundingArea is its own Engagementbereiche axis, not the XÖV
        // Foerderbereich the other sources crosswalk to, so the two disagree by
        // construction and comparing them flags every true merge. Reconciling the
        // axes is what config/vocab.ttl is for; until then the field carries no
        // signal across a DSEE pair.
        if (f === "fundingArea" && (src(p.a) === "dsee" || src(p.b) === "dsee")) continue
        const a = values(A ?? "", f), b = values(B ?? "", f)
        if (!a.size || !b.size) continue          // one side silent proves nothing
        comparable++
        const shared = [...a].filter(x => b.has(x))
        if (shared.length) { agree++; continue }
        conflict++
        detail.push(`${f}: {${[...a].join("|")}} vs {${[...b].join("|")}}`)
    }
    rows.push({ ...p, verdict: m[2].toUpperCase(), reason: m[3], agree, conflict, comparable, detail })
}

// A SAME whose comparable fields all conflict is the case worth re-reading; so is
// a DIFFERENT whose fields all agree. Neither is proof — a source simply may not
// classify a programme the same way — which is why this ranks rather than judges.
const suspicion = (r) =>
    r.verdict === "SAME"      ? (r.comparable ? r.conflict / r.comparable : 0)
  : r.verdict === "DIFFERENT" ? (r.comparable ? r.agree / r.comparable : 0)
  : 1
rows.sort((a, b) => suspicion(b) - suspicion(a) || b.comparable - a.comparable)

const flagged = rows.filter(r => suspicion(r) >= 0.5 && (r.comparable > 0 || r.verdict === "UNSURE"))
const vacuous = rows.filter(r => r.comparable === 0).length
console.log(`${rows.length} verdicts checked against ${FIELDS.length} fields the judge did not see`)
if (vacuous) console.log(`${vacuous} pair(s) had no comparable field — the check says nothing about those`)
console.log(`${flagged.length} worth re-reading:\n`)
for (const r of flagged) {
    console.log(`  [${r.id}] ${r.verdict} (score ${r.score}) — independent fields ${r.agree}/${r.comparable} agree`)
    console.log(`        ${r.an}`)
    console.log(`        ${r.bn}`)
    if (r.reason) console.log(`        reason given: ${r.reason}`)
    for (const d of r.detail) console.log(`        ${d}`)
    console.log()
}
const clean = rows.length - flagged.length
console.log(`${clean} verdict(s) the independent fields do not argue with.`)

// Emit a ready-to-paste adjudication prompt for the candidate pairs a threshold
// cannot separate, plus the evidence needed to separate them.
//
// Deliberately not an API client. At ~47 pairs the judgement is a paste, and
// keeping it out of the toolchain is what lets federate stay a pure function of
// data/ingest/ + config/. The verdicts come back through apply-verdicts.mjs into
// config/curation.ttl, which the engine already reads for owl:sameAs /
// owl:differentFrom -- so the judgement is committed and reviewable in a diff.
import fs from "fs"
import { createRequire } from "module"
const fuzz = createRequire(import.meta.url)("fuzzball")

const MIN = Number(process.argv[2] ?? 75)
const txt = fs.readFileSync("data/pipeline/mapped.ttl", "utf8")

// One value list per predicate. Matching `pred <x>` alone reads only the first
// value, because Turtle groups the rest with commas -- the bug that hid a
// 16-Land record from the earlier sample.
const values = (block, pred) => {
    const raw = block.match(new RegExp(`${pred}\\s+(.*?)(?=\\s*[;.]\\s*(?:\\n|$))`, "s"))?.[1] ?? ""
    return [...raw.matchAll(/<([^>]+)>|"((?:[^"\\]|\\.)*)"/g)].map(m => m[1] ?? m[2])
}

const recs = []
for (const b of txt.split(/\n(?=cdp:)/)) {
    const iri = b.match(/^(cdp:[\w-]+)/)?.[1]
    if (!iri) continue
    const name = values(b, "schema:name")[0]
    if (!name) continue
    recs.push({
        iri, src: iri.match(/^cdp:(fdb|dsee|eu|ff)-/)[1], name,
        desc: values(b, "schema:description")[0] ?? "",
        spatial: values(b, "dct:spatial"),
        url: values(b, "schema:url")[0] ?? "",
        keywords: values(b, "schema:keywords"),
        legal: values(b, "cdf:legalCitation")[0] ?? "",
        area: values(b, "cdf:fundingArea"),
    })
}

const bySrc = {}
for (const r of recs) (bySrc[r.src] ??= []).push(r)

// Only pairs that can actually meet: blocking compares within a shared
// dct:spatial bucket, and a record with no value is compared against everything.
const reachable = (a, b) =>
    !a.spatial.length || !b.spatial.length || a.spatial.some(x => b.spatial.includes(x))

const pairs = []
const srcs = Object.keys(bySrc)
for (let i = 0; i < srcs.length; i++)
    for (let j = i + 1; j < srcs.length; j++)
        for (const a of bySrc[srcs[i]])
            for (const b of bySrc[srcs[j]]) {
                const s = fuzz.token_sort_ratio(a.name, b.name)
                if (s >= MIN && reachable(a, b)) pairs.push({ s, a, b })
            }
pairs.sort((x, y) => y.s - x.s)

const trim = (s, n) => (s ?? "").replace(/\s+/g, " ").slice(0, n)
const side = (r) => [
    `  source: ${r.src}   ${r.iri}`,
    `  title: ${r.name}`,
    r.desc && `  description: ${trim(r.desc, 600)}`,
    r.spatial.length && `  regions: ${r.spatial.join(", ")}`,
    r.area.length && `  funding areas: ${r.area.join(", ")}`,
    r.keywords.length && `  keywords: ${r.keywords.slice(0, 12).join(", ")}`,
    r.legal && `  legal citation: ${trim(r.legal, 200)}`,
    r.url && `  url: ${r.url}`,
].filter(Boolean).join("\n")

const out = [
`You are deciding whether pairs of German funding programmes are THE SAME programme
listed by two different directories, or DIFFERENT programmes with similar names.

These pairs all scored highly on title similarity, which is exactly why the titles
cannot decide them. Use the descriptions, regions and other evidence.

Guidance drawn from known cases in this data:

- The same programme is often titled differently by each source: one adds an
  official abbreviation ("(Kommunalfoerderrichtlinie - KoFoeR)"), nominalises
  ("Energiekonzepte" vs "Foerderung von Energiekonzepten"), or prefixes a
  programme name ("Alpha Asyl - Kurse zur Alphabetisierung"). These are SAME.
- Different programmes often share a region name that inflates similarity:
  "Foerderung der Stiftung Naturschutz Schleswig-Holstein" vs "Foerderung des
  Sports in Schleswig-Holstein" are DIFFERENT.
- One word can invert the meaning: "Regionale" vs "ueberregionale Offene
  Behindertenarbeit" are DIFFERENT funding lines.
- Check the substance, not the wording: two "Stipendium fuer Medizinstudierende"
  entries are DIFFERENT if one commits the student to Sachsen-Anhalt for 3 years
  and the other to rural practice for 5.
- A programme covering all 16 regions is rarely the same as one specific to a
  single region.

Answer with one line per pair, nothing else:

  <id> SAME <short reason>
  <id> DIFFERENT <short reason>
  <id> UNSURE <what evidence would settle it>

`,
...pairs.map((p, i) => `--- ${i + 1} (title similarity ${p.s})\n${side(p.a)}\n\n${side(p.b)}\n`),
].join("\n")

fs.mkdirSync("data/curation", { recursive: true })
fs.writeFileSync("data/curation/judge-prompt.txt", out)
fs.writeFileSync("data/curation/judge-pairs.json", JSON.stringify(
    pairs.map((p, i) => ({ id: i + 1, score: p.s, a: p.a.iri, b: p.b.iri, an: p.a.name, bn: p.b.name })), null, 1))
console.log(`${pairs.length} pairs >=${MIN} → data/curation/judge-prompt.txt (${(out.length/1024).toFixed(0)} KB)`)

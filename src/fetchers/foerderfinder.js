import path from "path"
import fs from "fs"

// Förderfinder Bayern: public, unauthenticated JSON read API behind the SPA at
// foerderfinder.digital (Förderfinder Suite; data model = XFörderleistungs-
// beschreibung / XFLB 2.0.0). foerderfinder.digital serves Bayern only (~212
// programmes). We page the /search endpoint (q="" = all) and write the items[]
// array as one JSON file; the Lift step (src/lift/json.sparql) turns it into RDF
// and the clean step extracts title (attributes.titel) + description
// (attributes.teaser — both already plain text). withPayload stays false; the
// flattened attributes carry everything v1 needs.

const OUT_DIR = process.argv[2]
const BASE_URL = (process.argv[3] ?? "https://foerderfinder.digital/bayern/suche/apicall").replace(/\/$/, "")
// process.argv[4] is :limit from pipeline.ttl (0 / absent = no cap → all programmes).

const LIMIT = Number(process.argv[4]) || Infinity
const PAGE = 50
const get = async (offset) => {
    const url = `${BASE_URL}/search?q=&offset=${offset}&limit=${PAGE}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Förderfinder search failed: ${res.status} ${await res.text()}`)
    return res.json()
}

const first = await get(0)
const total = first.numFound ?? first.items.length
const target = Math.min(LIMIT, total)
const items = [...first.items]
for (let offset = PAGE; items.length < target; offset += PAGE) {
    const page = await get(offset)
    if (!page.items?.length) break
    items.push(...page.items)
}
const out = LIMIT === Infinity ? items : items.slice(0, LIMIT)

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "results.json")
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`  ${out.length} programmes (of ${total}) → ${outPath}`)

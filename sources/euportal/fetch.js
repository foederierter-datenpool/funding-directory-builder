import path from "path"
import fs from "fs"

// EU Funding & Tenders Portal (SEDIA search API). We query Topic records
// (type=1) — the fundable subjects, each carrying a title + descriptionByte.
//
// Closed topics are kept, not filtered out: a programme that has ended is still
// worth showing, and the consumer decides from cdf:status and the deadline. The
// portal states the status per topic (31094501 Forthcoming, 31094502 Open,
// 31094503 Closed — 6756 / 11658 / 228533 of the index), and extract turns that
// code into a slug.
//
// Be aware when reading a small sample: the API returns a fixed default order
// that is roughly oldest-first and ignores both sort and range —
// sort=deadlineDate:DESC, sort=startDate:DESC and a range filter on deadlineDate
// each return the identical unsorted 246947 hits. So the first page is the
// stalest page, and a limited run sees only long-closed topics. Raising :limit
// is what fixes that, not a query change.
// The endpoint is a POST: auth + paging in the query string, an Elasticsearch
// query as a multipart "query" part. We write the results[] array as one JSON
// file; the Lift step (src/lift/json.sparql) turns it into RDF and the clean
// step extracts title + description per result.

const OUT_DIR = process.argv[2]
const BASE_URL = process.argv[3] ?? "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity
const PAGE_SIZE = 100
const query = { bool: { must: [{ terms: { type: ["1"] } }] } }

const fetchPage = async (pageNumber) => {
    const params = new URLSearchParams({
        apiKey: "SEDIA", text: "***",
        pageSize: String(PAGE_SIZE), pageNumber: String(pageNumber),
    })
    const fd = new FormData()
    fd.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }))
    const res = await fetch(`${BASE_URL}?${params}`, { method: "POST", body: fd })
    if (!res.ok) throw new Error(`SEDIA search failed: ${res.status} ${await res.text()}`)
    return res.json()
}

const results = []
let total = Infinity
for (let page = 1; results.length < LIMIT && results.length < total; page++) {
    const json = await fetchPage(page)
    total = json.totalResults ?? results.length
    if (!json.results?.length) break
    results.push(...json.results)
}
const out = LIMIT === Infinity ? results : results.slice(0, LIMIT)

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "results.json")
fs.writeFileSync(outPath, JSON.stringify(out, null, 2))
console.log(`  ${out.length} topics (of ${total} total) → ${outPath}`)

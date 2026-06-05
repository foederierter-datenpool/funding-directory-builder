import path from "path"
import fs from "fs"

// EU Funding & Tenders Portal (SEDIA search API). We query Topic records
// (type=1) — the fundable subjects, each carrying a title + descriptionByte.
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

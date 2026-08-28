import path from "path"
import fs from "fs"

// Live source: the Förderdatenbank Bund, via the CSV that CorrelAid's fdb-scraper
// publishes weekly (https://github.com/CorrelAid/fdb_scraper). That scraper does the
// work this repo would otherwise duplicate: it pulls the BMWE export, checks it
// against a structural contract, decodes the nine closed vocabularies and validates
// every cell before publishing. Consuming it means ~2500 programmes with real
// categories instead of the raw export's generic <classifier>/<property> containers,
// and no 110MB XML in this repo.
//
// Endpoint: GET https://fdb.cdl.correlaid.org/data/programme.csv (no auth, CORS *).
// Column contract: https://fdb.cdl.correlaid.org/table-schema.json
//
// Written out as JSON, not as the .csv it arrives as, even though core 0.3.8 now
// ships a CSV lift. The multi-valued columns (funding_area, eligible_applicants,
// funding_type, funding_location, funding_body …) carry a JSON-encoded array of
// strings *inside one cell*, and neither the CSV lift nor the extract step can turn
// one cell into several values — SPARQL has no way to split a string into multiple
// bindings. Parsing here keeps the arrays as arrays, which the JSON lift then
// exposes as rdf:_N sequences like every other list-valued source in this
// federation. A CSV whose cells were scalar would need none of this.

const OUT_DIR = process.argv[2]
const CSV_URL = process.argv[3] ?? "https://fdb.cdl.correlaid.org/data/programme.csv"
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity

// Minimal RFC 4180 reader. Descriptions run to tens of thousands of characters and
// contain both quotes and newlines, so splitting on "\n" corrupts the table — the
// quote state has to be tracked.
function parseCsv(text) {
    const rows = []
    let row = [], field = "", quoted = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (quoted) {
            if (c !== '"') { field += c; continue }
            if (text[i + 1] === '"') { field += '"'; i++; continue }
            quoted = false
        } else if (c === '"') { quoted = true }
        else if (c === ",") { row.push(field); field = "" }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = "" }
        else if (c !== "\r") { field += c }
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row) }
    return rows
}

const res = await fetch(CSV_URL, { headers: { Accept: "text/csv" } })
if (!res.ok) throw new Error(`FDB CSV failed: ${res.status} ${res.statusText}`)
const text = await res.text()

const [header, ...rows] = parseCsv(text)
if (!header?.includes("id_url")) {
    throw new Error(`FDB CSV has no id_url column — got [${header?.slice(0, 5)}…]. Upstream schema changed?`)
}

// Cells holding a JSON array become arrays; everything else stays a string. Empty
// stays empty so the extract's isLiteral/non-empty guards behave as for any source.
const value = (cell) => {
    if (!cell.startsWith("[")) return cell
    try { return JSON.parse(cell) } catch { return cell }
}

const records = rows
    .filter((r) => r.length === header.length)
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, value(r[i])])))

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.writeFileSync(path.join(OUT_DIR, "programme.json"), JSON.stringify(records))

const skipped = rows.length - rows.filter((r) => r.length === header.length).length
console.log(`  ${records.length} programmes of ${rows.length}`
    + `${skipped ? ` (${skipped} malformed rows skipped)` : ""}`
    + ` (limit ${LIMIT === Infinity ? "none" : LIMIT}) → ${OUT_DIR}`)

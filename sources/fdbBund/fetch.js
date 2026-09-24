import { pathToFileURL } from "url"
import { emit, fetchOk, retry } from "@directory-builder/core/fetch"

// Live source: the Förderdatenbank Bund, via the CSV that CorrelAid's fdb-scraper
// publishes weekly (https://github.com/CorrelAid/fdb_scraper). That scraper does the
// work this repo would otherwise duplicate: it pulls the BMWE export, checks it
// against a structural contract, decodes the nine closed vocabularies and validates
// every cell before publishing. Consuming it means ~2500 programmes with real
// categories instead of the raw export's generic <classifier>/<property> containers,
// and no 110MB XML to carry.
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

// Minimal RFC 4180 reader. Descriptions run to tens of thousands of characters and
// contain both quotes and newlines, so splitting on "\n" corrupts the table — the
// quote state has to be tracked.
export function parseCsv(text) {
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

// Cells holding a JSON array become arrays; everything else stays a string. Empty
// stays empty so the extract's isLiteral/non-empty guards behave as for any source.
export const value = (cell) => {
    if (!cell.startsWith("[")) return cell
    try { return JSON.parse(cell) } catch { return cell }
}

// Header row + data rows → records, dropping rows whose arity does not match the
// header (a truncated download rather than a schema change).
export function toRecords(rows, header, limit = Infinity) {
    return rows
        .filter((r) => r.length === header.length)
        .slice(0, limit === Infinity ? undefined : limit)
        .map((r) => Object.fromEntries(header.map((h, i) => [h, value(r[i])])))
}

// Script entry. Guarded so the parsing above can be imported and unit-tested
// without a network call — it is the one piece of real logic in any fetch.js here,
// and the golden-file tests enter after it.
async function main() {
    const OUT_DIR = process.argv[2]
    const CSV_URL = process.argv[3] ?? "https://fdb.cdl.correlaid.org/data/programme.csv"
    // argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).
    const { limit } = JSON.parse(process.argv[4] || "{}")
    const LIMIT = Number(limit?.[0]) || Infinity

    // One request, no paging, no partitions — so of the primitives this needs only
    // the transport edge: a status check and a retry. fetchOk turns a non-OK status
    // into an error instead of a body, and retries 5xx/429 with backoff while
    // aborting on 4xx.
    const text = await retry(
        () => fetchOk(CSV_URL, { headers: { Accept: "text/csv" } }).then((r) => r.text()),
        { attempts: 5 })

    const [header, ...rows] = parseCsv(text)
    if (!header?.includes("id_url")) {
        throw new Error(`FDB CSV has no id_url column — got [${header?.slice(0, 5)}…]. Upstream schema changed?`)
    }
    const records = toRecords(rows, header, LIMIT)
    const skipped = rows.length - rows.filter((r) => r.length === header.length).length

    // emit writes the file and does the counting. The floor is what catches the
    // failure that actually happens to a single-request source: the endpoint answers,
    // the CSV parses, and it is nearly empty. A capped run states its own expectation
    // because emit otherwise checks the count against the source's total.
    await emit(records, {
        outDir: OUT_DIR,
        format: "json",
        stem: "programme",
        expect: LIMIT === Infinity ? { minRecords: 1000 } : { total: records.length },
    })
    console.log(`  ${records.length} programmes of ${rows.length}`
        + `${skipped ? ` (${skipped} malformed rows skipped)` : ""}`
        + ` (limit ${LIMIT === Infinity ? "none" : LIMIT})`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()

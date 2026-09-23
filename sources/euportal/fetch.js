import { harvest, emit, fetchOk } from "@directory-builder/core/fetch"

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
// A cap is rounded up to a page boundary: harvest fetches whole pages.
const MAX_PAGES = LIMIT === Infinity ? undefined : Math.ceil(LIMIT / PAGE_SIZE)
const query = { bool: { must: [{ terms: { type: ["1"] } }] } }

const fetchPage = async (pageNumber) => {
    const params = new URLSearchParams({
        apiKey: "SEDIA", text: "***",
        pageSize: String(PAGE_SIZE), pageNumber: String(pageNumber),
    })
    const fd = new FormData()
    fd.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }))
    return fetchOk(`${BASE_URL}?${params}`, { method: "POST", body: fd }).then((r) => r.json())
}

// Records are enormous relative to what is mapped — a median of 59 KB and a
// maximum of 2.3 MB, against six fields that together come to well under 1 KB. At a
// full harvest that is tens of GB of JSON no lift can parse, so projecting is what
// makes the source tractable rather than an optimisation.
//
// The rule is a size cap, not a list of fields to drop. A deny-list was tried first
// and does not hold: the bulk is a different field in different slices — 85 KB of
// metadata.latestInfos in one sample, 2.3 MB of metadata.callUpdates in another —
// so any hand-maintained list silently stops working when the API adds a blob.
// Capping by size drops whatever the blob of the day is and needs no maintenance.
//
// The mapped fields are exempt, because a cap that can drop them would be a
// correctness bug rather than a saving: descriptionByte alone reaches 34 KB, which
// is above any threshold that would catch the rest.
//
// Projection is lossy against the snapshot: a field dropped here needs a *refetch*
// to recover, not a re-extract. That is the cost of the cap being generous — at
// 8 KB it keeps every small field, mapped or not.
const MAPPED = ["identifier", "deadlineModel", "status", "deadlineDate", "title", "descriptionByte"]
const MAX_FIELD_BYTES = 8 * 1024
const project = (r) => ({
    ...r,
    metadata: Object.fromEntries(Object.entries(r.metadata ?? {}).filter(([k, v]) =>
        MAPPED.includes(k) || JSON.stringify(v).length <= MAX_FIELD_BYTES)),
})

// One unpartitioned corpus, paged. harvest carries the source's totalResults
// alongside each batch, which is what finally makes the cap visible: past 10,000
// results this API returns HTTP 200 with an empty results[], indistinguishable from
// exhaustion by the page alone. The old loop broke on the empty page and reported
// success; emit now compares against the reported total and fails the run.
//
// Which is also why the limit below is not a workaround for the cap. Any prefix is
// the stalest records, because the API ignores sort entirely. Escaping it needs the
// harvest partitioned on deadlineDate (range filters work, with epoch milliseconds —
// ISO strings silently match nothing); that is a separate change.
await emit(harvest({
    fetchOne: async (_partition, page) => {
        const json = await fetchPage(page)
        return { items: json.results ?? [], total: json.totalResults }
    },
    retry: { attempts: 5 },
    maxPages: MAX_PAGES,
}), {
    outDir: OUT_DIR,
    format: "json",
    stem: "results",
    project,
    // A capped run states its own expectation; uncapped, the source's total is used
    // and a truncated harvest throws.
    expect: LIMIT === Infinity ? {} : { total: MAX_PAGES * PAGE_SIZE },
})

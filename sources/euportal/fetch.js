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
// The harvest is partitioned on deadlineDate, which is what makes it complete.
// Two API behaviours force this. The endpoint ignores sort entirely — every
// spelling returns the same unsorted order — and it stops at 10,000 results per
// query, answering HTTP 200 with an empty results[] rather than an error. So an
// unpartitioned harvest silently caps at 10,000 of ~287,000, and the prefix it
// gives you is the stalest records.
//
// Range filters work, with epoch milliseconds — ISO strings match nothing and
// report no error. Partitions are half-months rather than months for headroom:
// measured across 149 months of the real index, none truncated, but the largest
// (2025-09) reached 9,638 against the 10,000 cap. A 3.6% margin is one busy
// month away from silent truncation, and partition count is nearly free because
// requests scale with records, not partitions.
//
// KNOWN GAP: 43,522 topics (15% of the index) carry no deadlineDate at all —
// the month bands sum to 243,712 against a reported 287,234 — and no range on
// that field can reach them. Harvesting them needs a separate partition on
// must_not exists deadlineDate, itself over the 10,000 cap and so needing a
// second axis to split on. Not done here.
const OUT_DIR = process.argv[2]
const BASE_URL = process.argv[3] ?? "https://api.tech.ec.europa.eu/search-api/prod/rest/search"
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity
const PAGE_SIZE = 100

// The cut. Everything before this is a closed EU call that ended years ago; the
// "keep ended programmes" decision was about recently ended German programmes,
// not the whole index back to 2014. 2024+ is 55,093 topics of ~287,000.
const FROM_YEAR = 2024
// Deadlines run into the future, so the upper bound is generous rather than
// today. An empty partition costs one request.
const TO_YEAR = 2030

// Half-month partitions: [1st, 16th) and [16th, 1st of next month).
const partitions = []
for (let y = FROM_YEAR; y <= TO_YEAR; y++)
    for (let m = 0; m < 12; m++) {
        partitions.push({ label: `${y}-${String(m + 1).padStart(2, "0")}a`, gte: Date.UTC(y, m, 1), lt: Date.UTC(y, m, 16) })
        partitions.push({ label: `${y}-${String(m + 1).padStart(2, "0")}b`, gte: Date.UTC(y, m, 16), lt: Date.UTC(y, m + 1, 1) })
    }

const fetchPage = async (partition, pageNumber) => {
    const params = new URLSearchParams({
        apiKey: "SEDIA", text: "***",
        pageSize: String(PAGE_SIZE), pageNumber: String(pageNumber),
    })
    const query = { bool: { must: [
        { terms: { type: ["1"] } },
        { range: { deadlineDate: { gte: partition.gte, lt: partition.lt } } },
    ] } }
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

// Paged within a partition, concurrent across partitions. harvest carries each
// partition's totalResults alongside its batches and emit sums them, so a
// partition that hits the 10,000 cap fails the run instead of quietly returning
// a prefix — the check that the unpartitioned version could not make.
//
// Chunked because the corpus no longer fits one file: ~27.5 KB per projected
// record across 55,093 records is ~1.5 GB, and the file count is the JVM count
// at lift. 2,000 records a file puts each near fdbBund's 56 MB, which lifts
// fine. Unlike HTML, chunking JSON needs no change to the extract — the lift
// already yields one node per array element, so records stay separable.
await emit(harvest({
    partitions,
    fetchOne: async (partition, page) => {
        const json = await fetchPage(partition, page)
        return { items: json.results ?? [], total: json.totalResults }
    },
    retry: { attempts: 5 },
    // Sequential across partitions, against harvest's default of 3. Node's bundled
    // undici throws an internal assertion -- assert(!this.paused) inside its own
    // parser, on a socket callback -- under concurrent fetch against this endpoint.
    // It is not a rejected promise, so retry cannot see it: it crashes the process.
    // Observed first on a 168-partition harvest of this same API for the blocking
    // measurement, which is why that script was written resumable and serial.
    concurrency: 1,
    // A development cap, marked as such so emit skips its completeness check. The
    // distinction matters most here: a capped run and a harvest cut short by the
    // 10,000-result ceiling both fall short of totalResults, and conflating them
    // would either mask the ceiling or fail every development run.
    limit: LIMIT,
}), {
    outDir: OUT_DIR,
    format: "json",
    stem: "results",
    chunk: 2000,
    project,
})

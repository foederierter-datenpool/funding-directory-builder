import { emit, fetchOk, retry } from "@directory-builder/core/fetch"
import { spawn } from "child_process"
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
// Queried server-side; LANGUAGE_PREFERENCE below picks between them per topic.
const LANGUAGES = ["en", "de"]

// The cut, on deadlineDate. Measured from a full 2024+ harvest of 72,200 topics:
// 2024 23,526 / 2025 19,189 / 2026 22,070 / 2027 7,367 / 2028 48.
//
// 2026 is the boundary because everything below it is a call whose deadline has
// already passed -- 2024 and 2025 closed one to two years ago, before this
// directory existed. The "keep ended programmes" rule was about *recently* ended
// ones. 2026+ keeps every still-open call plus the current year's closed ones:
// 29,485 topics, 41% of a 2024+ harvest, and a match space of ~1.4e8 pairs
// against ~3.4e8.
const FROM_YEAR = 2026
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
        // The API returns one record per topic per language -- all 24 official EU
        // languages -- so an unfiltered harvest is 96% duplication and moves ~24x
        // the bytes. The variants are not translations: metadata.title is the same
        // English string in all of them.
        //
        // Two languages rather than one, because neither covers the corpus alone.
        // Measured over 1176 distinct topics: en misses 21, de misses 30, and the
        // two together miss none. The overlap is collapsed below, preferring en.
        { terms: { language: LANGUAGES } },
    ] } }
    const fd = new FormData()
    fd.append("query", new Blob([JSON.stringify(query)], { type: "application/json" }))
    // connection: close is not politeness, it is a workaround. Node's bundled
    // undici trips an internal assertion -- assert(!this.paused) inside its own
    // parser -- when it reuses a kept-alive socket against this endpoint, which
    // returns ~15 MB per page. It surfaces on a socket callback rather than as a
    // rejected promise, so retry cannot see it and the process dies outright.
    // Serialising the harvest does not avoid it; a fresh connection per request
    // does, at the cost of a TLS handshake each time.
    return fetchOk(`${BASE_URL}?${params}`, {
        method: "POST", body: fd, headers: { connection: "close" },
    }).then((r) => r.json())
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

// ---- Crash tolerance -------------------------------------------------------
//
// Node's bundled undici trips an internal assertion -- assert(!this.paused) in
// Parser.finish -- partway through a long harvest of this endpoint. It is raised on
// a TLSSocket callback, not as a rejected promise, so retry cannot see it and the
// process dies outright. Two attempts to prevent it both failed: serialising to
// concurrency 1, and connection: close. It is volume-dependent rather than
// deterministic, and it killed the same API during the blocking-key harvest.
//
// So this stops trying to prevent the crash and survives it instead. Each partition
// runs in its own child process writing one cache file; a crash costs that partition
// and the parent retries it. This is the shape the blocking harvest already used,
// promoted into the fetcher.
//
// The cache lives beside the raw directory, never inside it: lift triplifies every
// file in outDir, so a stray .json cache there would be ingested as source data.
const CACHE_DIR = path.join(path.dirname(path.resolve(OUT_DIR, ".")), ".euportal-cache")
const cacheFile = (label) => path.join(CACHE_DIR, `${label}.json`)

// One partition, fully paged. Writes { total, items } so the parent can hand emit
// the source's reported total and keep its completeness check.
const fetchPartition = async (partition) => {
    const items = []
    let total
    for (let page = 1; page <= 200; page++) {
        const json = await retry(() => fetchPage(partition, page), { attempts: 5 })
        total = json.totalResults
        const batch = json.results ?? []
        for (const r of batch) items.push(project(r))
        if (!batch.length || items.length >= total) break
    }
    return { label: partition.label, total, items }
}

// Child mode: one partition, then exit. The parent re-spawns on a crash.
const childLabel = process.env.EUPORTAL_PARTITION
if (childLabel) {
    const partition = partitions.find((p) => p.label === childLabel)
    if (!partition) throw new Error(`unknown partition ${childLabel}`)
    const result = await fetchPartition(partition)
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    // Written to a temp name and renamed, so a crash mid-write cannot leave a
    // truncated cache file that the parent would then trust and skip.
    const tmp = `${cacheFile(childLabel)}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(result))
    fs.renameSync(tmp, cacheFile(childLabel))
    process.exit(0)
}

// Parent mode.
const runChild = (label) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [process.argv[1], ...process.argv.slice(2)], {
        env: { ...process.env, EUPORTAL_PARTITION: label },
        stdio: ["ignore", "ignore", "inherit"],
    })
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`partition ${label} exited ${code}`)))
    child.on("error", reject)
})

// The cache is a crash-recovery buffer, not a store. Left alone it would make every
// later ingest skip the network and re-emit a stale harvest -- a silent freeze of the
// source. So a run that completed marks itself done, and the next run starts by
// clearing what that run left behind. Only an *unfinished* cache is resumed.
const DONE_MARKER = path.join(CACHE_DIR, ".complete")
if (fs.existsSync(DONE_MARKER)) {
    fs.rmSync(CACHE_DIR, { recursive: true, force: true })
    console.log("  previous harvest was complete — starting fresh")
} else if (fs.existsSync(CACHE_DIR)) {
    const kept = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith(".json")).length
    if (kept) console.log(`  resuming an interrupted harvest — ${kept} partition(s) already cached`)
}

// Several partitions at once. This is safe only because each one is its own child
// process: the undici crash takes a single partition down, and it is retried. The
// harvest is network-bound -- ~15 MB a page, one page at a time saturates nothing --
// so the concurrency is what sets the wall-clock, not the request count.
const CHILD_CONCURRENCY = 3

fs.mkdirSync(CACHE_DIR, { recursive: true })
let done = 0, harvested = 0, stop = false
const pending = partitions.filter((p) => {
    if (!fs.existsSync(cacheFile(p.label))) return true
    harvested += JSON.parse(fs.readFileSync(cacheFile(p.label), "utf8")).items.length
    done++
    return false
})
if (done) console.log(`  ${done} partition(s) already cached, ${harvested} records`)

let next = 0
const worker = async () => {
    while (!stop) {
        const partition = pending[next++]
        if (!partition) return
        // The crash is the expected failure here, not an exceptional one, so the
        // retry count is generous.
        await retry(() => runChild(partition.label), { attempts: 6 })
        harvested += JSON.parse(fs.readFileSync(cacheFile(partition.label), "utf8")).items.length
        process.stdout.write(`\r  ${++done}/${partitions.length} partitions, ${harvested} records`)
        // A capped development run stops once it has enough rather than walking all
        // 168 partitions to throw most of the result away. With concurrency the
        // exact set that contributes is whichever finished first, so a capped run is
        // not reproducible -- use CHILD_CONCURRENCY 1 when it needs to be.
        if (harvested >= LIMIT) stop = true
    }
}
await Promise.all(Array.from({ length: CHILD_CONCURRENCY }, worker))
process.stdout.write("\n")

// Only the partitions actually harvested feed emit; the rest have no cache file.
const harvestedPartitions = partitions.filter((p) => fs.existsSync(cacheFile(p.label)))

// Marked only once every partition is in hand, so a crash leaves the cache resumable
// and a success leaves it disposable. A capped run never marks itself complete -- it
// did not harvest the corpus, and the next full run must not inherit its cache.
if (LIMIT === Infinity) fs.writeFileSync(DONE_MARKER, new Date().toISOString())

// The query already narrows to en/de, so what arrives here is at most two variants
// of a topic rather than 24. This collapses that last pair.
//
// Without it the directory would list a call twice and the match step would carry
// the duplicate through -- the pair can never merge with itself anyway, being same
// source with :dedupWithinSource false.
//
// metadata.identifier is the language-independent topic id (IMCAP-2026-INFOME) and
// is what identity should have been built on. Falls back to reference, which is
// unique per variant -- so a record with no identifier is kept rather than
// silently collapsed into another topic.
const LANGUAGE_PREFERENCE = ["en", "de"]
const topicId = (r) => (r.metadata?.identifier ?? [])[0] ?? r.reference
const langRank = (r) => {
    const i = LANGUAGE_PREFERENCE.indexOf(r.language)
    return i < 0 ? LANGUAGE_PREFERENCE.length : i
}

// Yielded per partition rather than collected, so peak memory is one partition's
// records instead of the whole corpus. emit sums the reported totals and fails the
// run if the harvest fell short of them.
async function* cached() {
    // Variants of a topic share a deadline and so land in the same partition, but
    // the set spans partitions to be safe -- it holds ids, not records.
    const seen = new Set()
    for (const partition of harvestedPartitions) {
        const { total, items } = JSON.parse(fs.readFileSync(cacheFile(partition.label), "utf8"))
        const best = new Map()
        for (const r of items) {
            const id = topicId(r)
            if (seen.has(id)) continue
            const prev = best.get(id)
            if (!prev || langRank(r) < langRank(prev)) best.set(id, r)
        }
        for (const id of best.keys()) seen.add(id)
        // fetched stays the pre-dedup count, so emit still checks the harvest
        // against what the source reported and reports the dedup separately --
        // intentional loss must not read as a shortfall.
        yield {
            items: [...best.values()],
            fetched: items.length,
            total,
            // A partition that hit the API's 10000-result cap is a truncated
            // harvest, not an exhausted one; emit turns this into a failed run.
            truncated: total != null && items.length < total,
        }
    }
}

// Chunked because the corpus no longer fits one file: ~17.7 KB per projected record
// across 55093 records is ~1 GB, and the file count is the JVM count at lift. 2000
// records a file puts each near fdbBund's 56 MB, which lifts fine. Unlike HTML,
// chunking JSON needs no change to the extract -- the lift already yields one node
// per array element, so records stay separable.
//
// LIMIT is applied here rather than in the harvest: the cache is the corpus, and a
// capped run is a view of it. capped tells emit to skip its completeness check.
await emit((async function* () {
    let taken = 0
    for await (const batch of cached()) {
        if (taken >= LIMIT) break
        const items = batch.items.slice(0, LIMIT - taken)
        taken += items.length
        yield { ...batch, items, capped: LIMIT !== Infinity }
    }
})(), {
    outDir: OUT_DIR,
    format: "json",
    stem: "results",
    chunk: 2000,
})

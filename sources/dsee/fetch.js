import { pool, fetchOk } from "@directory-builder/core/fetch"
import path from "path"
import fs from "fs"

// DSEE Förderdatenbank is server-rendered HTML. The listing is paginated: the root
// is page 1, then /p2 … /pN. Each listing links to detail pages at
// /foerderprogramme/<slug>. We collect every detail URL across all listing pages,
// then fetch each detail page and write it as <slug>.html — the per-file lift step
// (src/lift/html.sparql) turns each into RDF; the extract picks out title +
// description. Two-phase: crawl the listing, then fetch details.
//
// Concurrency, retry and status checking come from @directory-builder/core/fetch.
// This source is why fetchOk exists: it previously checked no status anywhere, so a
// 500 or a bot-challenge page was written to disk and lifted as though it were a
// programme, and a 1349-page harvest had no way to tell a short corpus from a
// complete one. Nothing downstream can detect that — an error page yields no fields,
// which reads exactly like a programme that happens not to state any.
//
// stopOnError stays at its default (true). A partial harvest nobody notices is the
// worse failure while nothing validates volume; better to fail the run loudly. The
// count check below is the cheap half of that until harvest validation lands.

const OUT_DIR = process.argv[2]
const BASE_URL = (process.argv[3] ?? "https://foerderdatenbank.d-s-e-e.de").replace(/\/$/, "")
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity
const detailRe = /href="([^"]*\/foerderprogramme\/[^"#?]+)"/g
const RETRY = { attempts: 5 }
const text = (url) => fetchOk(url).then((r) => r.text())

// Discover the last page number from the root listing's pagination links.
const rootHtml = await text(`${BASE_URL}/`)
const pageNums = [...rootHtml.matchAll(/\/p(\d+)\b/g)].map((m) => Number(m[1]))
const lastPage = pageNums.length ? Math.max(...pageNums) : 1

// Phase 1: every listing page, concurrently. Previously this loop stopped early once
// LIMIT slugs had been seen; it now fetches all of them and slices afterwards. The
// pages are cheap (54 of them) and pool returns results index-aligned, so slugs are
// collected in page order and a capped run takes a *reproducible* prefix rather than
// whichever pages happened to finish first.
const pageUrls = Array.from({ length: lastPage - 1 }, (_, i) => `${BASE_URL}/p${i + 2}`)
const { results: pages } = await pool(pageUrls, text,
    { concurrency: 3, delayMs: 100, retry: RETRY })

const slugs = new Map()   // slug -> absolute detail URL, insertion-ordered by page
const addLinks = (html) => {
    for (const m of html.matchAll(detailRe)) {
        const href = m[1].replace(/&amp;/g, "&")
        const url = href.startsWith("http") ? href : new URL(href, BASE_URL).toString()
        const slug = url.split("/foerderprogramme/")[1].replace(/\/$/, "")
        if (!slugs.has(slug)) slugs.set(slug, url)
    }
}
addLinks(rootHtml)
for (const html of pages) addLinks(html)
console.log(`  ${lastPage} listing pages → ${slugs.size} distinct detail URLs`)

// Phase 2: the detail pages. Deduplicated above, because a duplicate here costs an
// HTTP request now and a JVM at lift later, and nothing downstream can undo either.
const queue = [...slugs.entries()].slice(0, LIMIT === Infinity ? undefined : LIMIT)
fs.mkdirSync(OUT_DIR, { recursive: true })

await pool(queue, async ([slug, url]) => {
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), await text(url))
}, {
    concurrency: 3,
    delayMs: 100,
    retry: RETRY,
    onProgress: ({ completed, total }) => process.stdout.write(`\r  ${completed}/${total}`),
})
process.stdout.write("\n")

// Cheap completeness check: every enumerated URL must have produced a file. pool
// rejects on a page that fails every attempt, so this catches the quieter case —
// a write that silently did not happen.
const written = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".html")).length
if (written !== queue.length)
    throw new Error(`DSEE: enumerated ${queue.length} detail pages but wrote ${written}`)
console.log(`  ${written} detail pages → ${OUT_DIR}`)

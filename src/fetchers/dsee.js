import path from "path"
import fs from "fs"

// DSEE Förderdatenbank is server-rendered HTML. The listing is paginated:
// the root is page 1, then /p2 … /pN. Each listing links to detail pages at
// /foerderprogramme/<slug>. We collect every detail URL across all listing
// pages, then fetch each detail page and write it as <slug>.html — the per-file
// Lift step (src/lift/html.sparql) turns each into RDF; the clean step extracts
// title + description. Pattern: scrape listing index → fetch details, throttled.

const OUT_DIR = process.argv[2]
const BASE_URL = (process.argv[3] ?? "https://foerderdatenbank.d-s-e-e.de").replace(/\/$/, "")
// process.argv[4] is :limit from pipeline.ttl (0 / absent = no cap → all programmes).

const LIMIT = Number(process.argv[4]) || Infinity
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const detailRe = /href="([^"]*\/foerderprogramme\/[^"#?]+)"/g

// Discover the last page number from the root listing's pagination links.
const rootHtml = await (await fetch(`${BASE_URL}/`)).text()
const pageNums = [...rootHtml.matchAll(/\/p(\d+)\b/g)].map((m) => Number(m[1]))
const lastPage = pageNums.length ? Math.max(...pageNums) : 1

const slugs = new Map() // slug -> absolute detail URL
const addLinks = (html) => {
    let added = 0
    for (const m of html.matchAll(detailRe)) {
        const href = m[1].replace(/&amp;/g, "&")
        const url = href.startsWith("http") ? href : new URL(href, BASE_URL).toString()
        const slug = url.split("/foerderprogramme/")[1].replace(/\/$/, "")
        if (!slugs.has(slug)) { slugs.set(slug, url); added++ }
    }
    return added
}

addLinks(rootHtml)
for (let p = 2; p <= lastPage && slugs.size < LIMIT; p++) {
    const html = await (await fetch(`${BASE_URL}/p${p}`)).text()
    const added = addLinks(html)
    console.log(`  p${p}/${lastPage}: ${added} new (total ${slugs.size})`)
    await sleep(100)
}

const queue = [...slugs.entries()].slice(0, LIMIT === Infinity ? undefined : LIMIT)
console.log(`Fetching ${queue.length} detail pages (3 in parallel)…`)
fs.mkdirSync(OUT_DIR, { recursive: true })

const CONCURRENCY = 3
let active = 0, idx = 0, done = 0
await new Promise((resolve, reject) => {
    const tick = () => {
        if (idx >= queue.length && active === 0) return resolve()
        while (active < CONCURRENCY && idx < queue.length) {
            const [slug, url] = queue[idx++]
            active++
            ;(async () => {
                try {
                    const html = await (await fetch(url)).text()
                    fs.writeFileSync(path.join(OUT_DIR, `${slug}.html`), html)
                    done++
                    process.stdout.write(`\r  ${done}/${queue.length}`)
                    await sleep(100)
                } catch (e) { reject(e) }
                finally { active--; tick() }
            })()
        }
    }
    tick()
})
process.stdout.write("\n")

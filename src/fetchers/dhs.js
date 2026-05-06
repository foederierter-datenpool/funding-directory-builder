import path from "path"
import fs from "fs"

const OUT_DIR = process.argv[2]
const BASE_URL = process.argv[3]
const PLZ = "10115"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const searchParams = new URLSearchParams({
    "tx_wwdhseinrichtung2_fe1[action]":               "search",
    "tx_wwdhseinrichtung2_fe1[entrys][currentPage]":  "1",
    "tx_wwdhseinrichtung2_fe1[plzort]":               PLZ,
})
const searchUrl = `${BASE_URL}?${searchParams}`

console.log(`Discovering DHS entries from ${searchUrl}`)
const indexHtml = await (await fetch(searchUrl)).text()

const detailRe = /href="([^"]*action%5D=show[^"]*entry%5D=(\d+)[^"]*)"/g
const detailUrls = new Map()
for (const m of indexHtml.matchAll(detailRe)) {
    if (detailUrls.has(m[2])) continue
    const href = m[1].replace(/&amp;/g, "&")
    detailUrls.set(m[2], href.startsWith("http") ? href : new URL(href, BASE_URL).toString())
}

console.log(`Found ${detailUrls.size} entries; fetching details (3 in parallel)…`)
fs.mkdirSync(OUT_DIR, { recursive: true })

const queue = [...detailUrls.entries()]
const LIMIT = 3
let active = 0, idx = 0, done = 0
await new Promise((resolve, reject) => {
    const tick = () => {
        if (idx >= queue.length && active === 0) return resolve()
        while (active < LIMIT && idx < queue.length) {
            const [id, url] = queue[idx++]
            active++
            ;(async () => {
                try {
                    const html = await (await fetch(url)).text()
                    fs.writeFileSync(path.join(OUT_DIR, `${id}.html`), html)
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

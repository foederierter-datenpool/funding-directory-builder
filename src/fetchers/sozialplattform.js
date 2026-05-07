import path from "path"
import fs from "fs"

const OUT_DIR = process.argv[2]
const BASE_URL = process.argv[3]
const PLZS = process.argv[4].split(",")
const PER_PAGE = 100

const fetchPage = async (plz, page) => {
    const url = `${BASE_URL}?place=${plz}&page=${page}&itemsPerPage=${PER_PAGE}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Page ${page}: HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== "success") throw new Error(`Page ${page}: API status ${json.status}`)
    return json.data
}

fs.mkdirSync(OUT_DIR, { recursive: true })

for (const plz of PLZS) {
    const first = await fetchPage(plz, 1)
    const totalPages = Math.ceil(first.total / PER_PAGE)
    const allItems = [...first.items]
    for (let page = 2; page <= totalPages; page++) {
        const data = await fetchPage(plz, page)
        allItems.push(...data.items)
    }
    const outPath = path.join(OUT_DIR, `${plz}.json`)
    fs.writeFileSync(outPath, JSON.stringify(allItems, null, 2))
    console.log(`  ${plz}: ${allItems.length} items (${totalPages} pages) → ${outPath}`)
}

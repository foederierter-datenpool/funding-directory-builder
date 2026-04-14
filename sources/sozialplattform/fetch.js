import path from "path"
import fs from "fs"

const OUT_DIR = path.join(import.meta.dirname, "data")
fs.mkdirSync(OUT_DIR, { recursive: true })
const OUT = path.join(OUT_DIR, "sozialplattform.json")

const BASE_URL = "https://sozialplattform.de/content/de/api/v1/consultation/search"
const PER_PAGE = 100

async function fetchPage(page) {
    const url = `${BASE_URL}?page=${page}&itemsPerPage=${PER_PAGE}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Page ${page}: HTTP ${res.status}`)
    const json = await res.json()
    if (json.status !== "success") throw new Error(`Page ${page}: API status ${json.status}`)
    return json.data
}

const first = await fetchPage(1)
const totalPages = Math.ceil(first.total / PER_PAGE)
console.log(`Total: ${first.total} items, ${totalPages} pages`)

const allItems = [...first.items]

for (let page = 2; page <= totalPages; page ++) {
    const data = await fetchPage(page)
    allItems.push(...data.items)
    console.log(`Fetched page ${page}/${totalPages}`)
}

fs.writeFileSync(OUT, JSON.stringify(allItems, null, 2))
console.log(`Wrote ${allItems.length} items to ${OUT}`)

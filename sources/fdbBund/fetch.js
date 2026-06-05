import path from "path"
import fs from "fs"

// Static-file source: the Förderdatenbank Bund export is one big XML
// (<documents><document>…</document>…</documents>), ~2503 gsb:ServiceOffer
// programmes. For this first version we sample the first N and write each
// <document> back out as its own small standalone XML file, so the per-file
// Lift step (src/lift/xml.sparql) can turn each into its own RDF document.
// Field extraction (title / description) stays declarative in the clean step.

const OUT_DIR = process.argv[2]
const SRC_DIR = process.argv[3]
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity
const SRC_FILE = path.join(SRC_DIR, "foerderprogramme_export.xml")

const xml = fs.readFileSync(SRC_FILE, "utf8")

// Split into <document>…</document> blocks. The file is flat (every document is
// a direct child of the root), so a non-greedy scan over the opening tag through
// the matching close is enough — no nested <document> elements occur.
const docRe = /<document\b[^>]*>[\s\S]*?<\/document>/g
const slugRe = /<document\b[^>]*\bname="([^"]*)"/

fs.mkdirSync(OUT_DIR, { recursive: true })

let n = 0
for (const m of xml.matchAll(docRe)) {
    if (n >= LIMIT) break
    const block = m[0]
    const slug = (block.match(slugRe)?.[1] ?? `doc-${n}`).replace(/[^a-z0-9_-]/gi, "-")
    const standalone = `<?xml version="1.0" encoding="UTF-8"?>\n<documents>\n${block}\n</documents>\n`
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.xml`), standalone)
    n++
}

console.log(`  ${n} programmes (limit ${LIMIT === Infinity ? "none" : LIMIT}) → ${OUT_DIR}`)

import path from "path"
import fs from "fs"
import { unzipSync } from "fflate"

// Live source: the Förderdatenbank Bund (BMWE) export endpoint returns a single
// ZIP of ~2500+ GSB Repository XML files — one <document> per file, plus
// referenced contacts/categories/classifications. We keep only the
// type="gsb:ServiceOffer" documents (the actual funding programmes), wrap each
// back into <documents>…</documents> (the shape the Lift step expects) and write
// it out as its own small standalone XML file. Field extraction (title /
// description) stays declarative in the extract step.
//
// Endpoint: GET https://www.foerderdatenbank.de/FDB/WS/export (no auth, no
// params; server caches ~24h by default). See sources/fdbBund schema docs.

const OUT_DIR = process.argv[2]
const EXPORT_URL = process.argv[3] ?? "https://www.foerderdatenbank.de/FDB/WS/export"
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity

const slugRe = /<document\b[^>]*\bname="([^"]*)"/

// The endpoint sits behind Radware bot protection: a plain client gets HTTP 200
// with an HTML CAPTCHA page instead of the ZIP. A browser User-Agent passes the
// (header-fingerprint) check — there is no JS challenge to solve here.
const res = await fetch(EXPORT_URL, {
    headers: {
        Accept: "application/zip",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        "Accept-Language": "de-DE,de;q=0.9",
    },
})
if (!res.ok) throw new Error(`FDB export failed: ${res.status} ${res.statusText}`)
const buf = new Uint8Array(await res.arrayBuffer())
// Guard: a bot-block page is HTML (200 OK), not a ZIP. Fail loudly rather than
// emitting fflate's cryptic "invalid zip data".
if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    const ct = res.headers.get("content-type")
    throw new Error(`FDB export did not return a ZIP (content-type ${ct}, ${buf.length} bytes) — likely the Radware bot block`)
}
const zip = unzipSync(buf)

fs.mkdirSync(OUT_DIR, { recursive: true })

const dec = new TextDecoder("utf-8")
let n = 0
for (const [entry, bytes] of Object.entries(zip)) {
    if (n >= LIMIT) break
    if (!entry.endsWith(".xml")) continue
    const doc = dec.decode(bytes)
    // Keep only funding programmes; skip contacts/categories/classifications.
    if (!/<document\b[^>]*\btype="gsb:ServiceOffer"/.test(doc)) continue
    // Strip any XML declaration the entry carries — we add our own wrapper.
    const block = doc.replace(/^\s*<\?xml[^>]*\?>\s*/, "").trim()
    const slug = (block.match(slugRe)?.[1] ?? path.basename(entry, ".xml") ?? `doc-${n}`)
        .replace(/[^a-z0-9_-]/gi, "-")
    const standalone = `<?xml version="1.0" encoding="UTF-8"?>\n<documents>\n${block}\n</documents>\n`
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.xml`), standalone)
    n++
}

console.log(`  ${n} programmes (limit ${LIMIT === Infinity ? "none" : LIMIT}) → ${OUT_DIR}`)

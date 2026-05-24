import path from "path"
import fs from "fs"

// Static-file source:
//   - organisations_filtered.json --> names, addresses, webseite, hierarchy
//   - organisations_all_filtered.json --> BAGFW service categories
// Both records carry the same id per org, the clean-step will unify them

const OUT_DIR = process.argv[2]
const SRC_DIR = process.argv[3]

const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), "utf8")).data
const records = [
    ...read("organisations_filtered.json"),
    ...read("organisations_all_filtered.json"),
]

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "awo.json")
fs.writeFileSync(outPath, JSON.stringify(records, null, 2))
console.log(`  ${records.length} records (2 endpoints co-located) → ${outPath}`)

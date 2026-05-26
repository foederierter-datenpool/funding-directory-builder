import path from "path"
import fs from "fs"

// Static-file source:
//   - organisations_filtered.json     --> names, webseite, hierarchy
//   - organisations_all_filtered.json --> BAGFW service categories
//   - locations_filtered.json         --> addresses
// Org records share one id per org (the clean step unifies them); location
// records carry an organisation_id back-link, joined to orgs in the clean step.

const OUT_DIR = process.argv[2]
const SRC_DIR = process.argv[3]

const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), "utf8")).data
const records = [
    ...read("organisations_filtered.json"),
    ...read("organisations_all_filtered.json"),
    ...read("locations_filtered.json"),
]

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "awo.json")
fs.writeFileSync(outPath, JSON.stringify(records, null, 2))
console.log(`  ${records.length} records (3 endpoints co-located) → ${outPath}`)

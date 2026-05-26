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
const PLZS = (process.argv[4] ?? "").split(",").map((s) => s.trim()).filter(Boolean)

const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), "utf8")).data

// The static files cover all of Berlin; scope them to the pipeline's PLZs
const locations = read("locations_filtered.json")
const keptLocations = PLZS.length ? locations.filter((l) => PLZS.includes(String(l.plz))) : locations
const inScope = new Set(keptLocations.map((l) => l.organisation_id))
const orgInScope = (o) => PLZS.length === 0 || inScope.has(o.id)

const records = [
    ...read("organisations_filtered.json").filter(orgInScope),
    ...read("organisations_all_filtered.json").filter(orgInScope),
    ...keptLocations,
]

fs.mkdirSync(OUT_DIR, { recursive: true })
const outPath = path.join(OUT_DIR, "awo.json")
fs.writeFileSync(outPath, JSON.stringify(records, null, 2))
console.log(`  ${records.length} records (3 endpoints, PLZs ${PLZS.join("/") || "all"}) → ${outPath}`)

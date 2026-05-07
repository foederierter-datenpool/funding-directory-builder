import { loadMerge } from "./loadMerge.js"
import { isConflict } from "./OrgCard.jsx"
import provTtl from "../../data/pipeline/provenance.ttl?raw"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import finalTtl from "../../data/pipeline/final.ttl?raw"

const conflictCount = (org) => org.fields.reduce((n, f) => n + (isConflict(f) ? 1 : 0), 0)

// Merge view sorts by conflict count desc; the directory mirrors that order
// so the same org sits in the same visual slot across pages.
export const mergedOrgs = loadMerge(mergedTtl, provTtl).sort((a, b) => conflictCount(b) - conflictCount(a) || a.iri.localeCompare(b.iri))
const orderIndex = new Map(mergedOrgs.map((o, i) => [o.iri, i]))
export const finalOrgs = loadMerge(finalTtl, "").sort((a, b) => (orderIndex.get(a.iri) ?? Infinity) - (orderIndex.get(b.iri) ?? Infinity))

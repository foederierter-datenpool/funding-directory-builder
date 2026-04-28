import { sparqlSelect, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import path from "path"
import fs from "fs"

export const ROOT= path.join(import.meta.dirname, "..")
export const abs = (p) => path.join(ROOT, p)

export const PFX = `PREFIX : <https://civic-data.de/pipeline#>`
export const stepNum = (iri) => parseInt(iri.split("#step").pop(), 10)

export const loadDefs = (...relPaths) => storeFromTurtles(relPaths.map(p => fs.readFileSync(abs(p), "utf8")))

export const makeQ = (defs) => (body) => sparqlSelect(PFX + body, [defs])

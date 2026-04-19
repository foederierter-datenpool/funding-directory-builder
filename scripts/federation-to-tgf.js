import { sparqlSelect, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import fs from "fs"
import path from "path"

const FEDERATION_TTL = path.join(import.meta.dirname, "..", "definitions", "federation.ttl")
const store = storeFromTurtles([fs.readFileSync(FEDERATION_TTL, { encoding: "utf8" })])

const nodeRows = await sparqlSelect(`
    PREFIX : <https://civic-data.de/pipeline#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT DISTINCT ?node WHERE {
        {
            ?node a :Source
        } UNION {
            ?node a :SourceField
        } UNION {
            ?node a :TargetField
        } UNION {
            ?node a :TargetSchema
        }
    }`, [store])

const edgeRows = await sparqlSelect(`
    PREFIX : <https://civic-data.de/pipeline#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?from ?to ?label WHERE {
        { 
            ?from :hasField ?to .
            BIND("hasField" AS ?label) 
        } UNION {
            ?to :hasTargetField ?from .
            BIND("isTargetFieldOf" AS ?label)
        } UNION {
            [] a :Mapping ;
                :hasFieldMapping [ :from ?from ; :to ?to ] .
            BIND("mapsTo" AS ?label)
        }
    }`, [store])

const localName = (iri) => iri.replace(/^.*[#/]/, "")
const ids = new Map()
const id = (iri) => {
    if (ids.has(iri)) return ids.get(iri)
    const newId = ids.size + 1
    ids.set(iri, newId)
    return newId
}

const nodes = nodeRows.map(({ node }) => `${id(node)} ${localName(node)}`)
const edges = edgeRows.map(({ from, to, label }) => `${id(from)} ${id(to)} ${label}`)

// TGF: Trivial Graph Format. yEd can open and layout this, for instance.
console.log([...nodes, "#", ...edges].join("\n"))

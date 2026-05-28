// Shared helpers used by both src/ (Node pipeline) and webapp/src/ (browser).
// Keep this file browser-safe — no `fs`, no Node-only APIs. File-IO helpers
// belong in their consumer.

import { Parser } from "n3"

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"

export const localName = (iri) => iri.replace(/^.*[#/]/, "")

export const parseTtl = (turtle) => new Parser().parse(turtle)

// {prefix: namespace} → "PREFIX p1: <ns1>\nPREFIX p2: <ns2>"
export const buildPrefixBlock = (prefixMap) =>
    Object.entries(prefixMap).map(([p, ns]) => `PREFIX ${p}: <${ns}>`).join("\n")

// Returns the IRI shortened against the supplied {prefix: namespace} map,
// or the original IRI verbatim if no prefix matches.
export const shrink = (iri, prefixMap) => {
    for (const [p, ns] of Object.entries(prefixMap)) {
        if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
    }
    return iri
}

// Kahn's algorithm: process nodes whose predecessors are all done, breaking
// ties alphabetically for a deterministic ordering. Predecessors that fall
// outside the loaded subset are silently ignored.
export function topoSort(nodes, predsOf) {
    const remaining = new Map()
    for (const iri of nodes.keys()) remaining.set(iri, predsOf(iri).filter(p => nodes.has(p)).length)
    const sorted = []
    while (remaining.size) {
        const ready = [...remaining].filter(([, n]) => n === 0).map(([iri]) => iri).sort()
        if (!ready.length) throw new Error("Cycle in dependency graph")
        for (const iri of ready) {
            sorted.push(iri)
            remaining.delete(iri)
            for (const [other] of remaining) {
                if (predsOf(other).includes(iri)) remaining.set(other, remaining.get(other) - 1)
            }
        }
    }
    return sorted
}

// Set of subjects typed `rdf:type typeIri`. Iteration order = encounter order.
export function subjectsOfType(quads, typeIri) {
    const out = new Set()
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE && q.object.value === typeIri) out.add(q.subject.value)
    }
    return out
}

// Map<subjectIri, Set<typeIri>> for every typed subject in quads.
export function typesOf(quads) {
    const out = new Map()
    for (const q of quads) {
        if (q.predicate.value !== RDF_TYPE) continue
        let set = out.get(q.subject.value)
        if (!set) { set = new Set(); out.set(q.subject.value, set) }
        set.add(q.object.value)
    }
    return out
}

// Map<subjectIri, Map<predicateIri, valueString[]>>. Values come from
// q.object.value, so literals and IRIs both render as strings. Insertion order
// of the outer Map = encounter order of subjects in quads.
export function groupBySubject(quads, { literalsOnly = false } = {}) {
    const out = new Map()
    for (const q of quads) {
        if (literalsOnly && q.object.termType !== "Literal") continue
        const s = q.subject.value
        let row = out.get(s)
        if (!row) { row = new Map(); out.set(s, row) }
        const p = q.predicate.value
        let arr = row.get(p)
        if (!arr) { arr = []; row.set(p, arr) }
        arr.push(q.object.value)
    }
    return out
}

// Reference snippet — kept for re-use, not currently invoked.
const fetchPostalCodesFromWikidata = async () => {
    const QUERY = `SELECT DISTINCT ?postalCode WHERE {
    # Bezirk Mitte | postal code
        wd:Q163966 wdt:P281 ?postalCode .
    } ORDER BY ?postalCode`
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`
    const res = await fetch(url, {headers: {
        "Accept":     "application/sparql-results+json",
        "User-Agent": "directory-builder",
    }})
    if (!res.ok) throw new Error(`Wikidata returned ${res.status}: ${await res.text()}`)
    const {results} = await res.json()
    for (const b of results.bindings) console.log(b.postalCode.value)
}

// await fetchPostalCodesFromWikidata()

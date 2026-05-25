// Source identity lives in config: federation.ttl declares each :Source (label,
// skos:notation, order); pipeline.ttl ties it to a cleaned-data file. JS never
// hardcodes a source name — it resolves records to a :Source via cdp:fromSource.

import { parseTtl } from "../../utils.js"

const NS = "https://civic-data.de/pipeline#"
const RDFS_LABEL    = "http://www.w3.org/2000/01/rdf-schema#label"
const SKOS_NOTATION = "http://www.w3.org/2004/02/skos/core#notation"
const PROV_AT_TIME  = "http://www.w3.org/ns/prov#atTime"
const HAS_SOURCE    = `${NS}hasSource`
const FROM_SOURCE   = `${NS}fromSource`
const OF_SOURCE     = `${NS}ofSource`
const SOURCE_GRAPH  = `${NS}sourceGraph`
const GRAPH         = `${NS}graph`
const INPUT         = `${NS}input`

// Map<SourceIRI, {iri, label, notation, order}> from federation.ttl; order
// follows the :hasSource list. Assumes each :Source has a label and notation.
export function loadSourceMeta(federationTtl) {
    const order = new Map()
    const labelOf = new Map()
    const notationOf = new Map()
    let n = 0
    for (const q of parseTtl(federationTtl)) {
        const p = q.predicate.value
        if      (p === HAS_SOURCE && !order.has(q.object.value)) order.set(q.object.value, n++)
        else if (p === RDFS_LABEL)    labelOf.set(q.subject.value, q.object.value)
        else if (p === SKOS_NOTATION) notationOf.set(q.subject.value, q.object.value)
    }
    const meta = new Map()
    for (const iri of order.keys()) {
        meta.set(iri, { iri, label: labelOf.get(iri), notation: notationOf.get(iri), order: order.get(iri) })
    }
    return meta
}

// Order two Source IRIs by their federation declaration order, then IRI.
export function compareSources(a, b, meta) {
    const oa = meta.get(a).order
    const ob = meta.get(b).order
    return oa !== ob ? oa - ob : a.localeCompare(b)
}

// Map<recordIri, SourceIRI> from plain cdp:fromSource triples (mapped.ttl).
export function loadSourceOfRecord(ttl) {
    const out = new Map()
    for (const q of parseTtl(ttl)) if (q.predicate.value === FROM_SOURCE) out.set(q.subject.value, q.object.value)
    return out
}

// Map<SourceIRI, latest ISO timestamp> from the ingest log's harvest entries.
export function loadHarvestBySource(logTtl) {
    const source = new Map()
    const time = new Map()
    for (const q of parseTtl(logTtl)) {
        if      (q.predicate.value === OF_SOURCE)    source.set(q.subject.value, q.object.value)
        else if (q.predicate.value === PROV_AT_TIME) time.set(q.subject.value, q.object.value)
    }
    const out = new Map()
    for (const [bnode, src] of source) {
        const t = time.get(bnode)
        if (t && (!out.has(src) || t > out.get(src))) out.set(src, t)
    }
    return out
}

// Map<SourceIRI, cleaned-TTL raw string>, resolved from config alone: federation
// maps each :Source to a graph (:fromSource/:sourceGraph), pipeline maps that
// graph to a file (:Load :graph/:input), then files are matched by basename.
// `rawByPath` comes from import.meta.glob(".../cleaned/*.ttl", ...).
export function loadCleanedBySource(federationTtl, pipelineTtl, rawByPath) {
    const sourceOf = new Map()
    const sourceGraphOf = new Map()
    for (const q of parseTtl(federationTtl)) {
        if      (q.predicate.value === FROM_SOURCE)  sourceOf.set(q.subject.value, q.object.value)
        else if (q.predicate.value === SOURCE_GRAPH) sourceGraphOf.set(q.subject.value, q.object.value)
    }
    const graphOfSource = new Map()
    for (const [mapping, src] of sourceOf) {
        const graph = sourceGraphOf.get(mapping)
        if (graph) graphOfSource.set(src, graph)
    }

    const fileOfGraph = new Map()
    const graphOfStep = new Map()
    const inputOfStep = new Map()
    for (const q of parseTtl(pipelineTtl)) {
        if      (q.predicate.value === GRAPH) graphOfStep.set(q.subject.value, q.object.value)
        else if (q.predicate.value === INPUT) inputOfStep.set(q.subject.value, q.object.value)
    }
    for (const [step, graph] of graphOfStep) {
        const input = inputOfStep.get(step)
        if (input) fileOfGraph.set(graph, input)
    }

    const basename = (p) => p.split("/").pop()
    const rawByBase = new Map()
    for (const [path, raw] of Object.entries(rawByPath)) rawByBase.set(basename(path), raw)

    const out = new Map()
    for (const [src, graph] of graphOfSource) {
        const file = fileOfGraph.get(graph)
        const raw = file && rawByBase.get(basename(file))
        if (raw) out.set(src, raw)
    }
    return out
}

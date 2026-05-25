import { localName, parseReifications, parseTtl, shrink } from "../../utils.js"
import { compareSources, loadSourceMeta } from "./sourceMeta.js"

const NS = "https://civic-data.de/pipeline#"
const PROV_DERIVED_FROM = "http://www.w3.org/ns/prov#wasDerivedFrom"
const FROM_SOURCE = `${NS}fromSource`

const PREFIXES = {
    schema: "http://schema.org/",
    dct:    "http://purl.org/dc/terms/",
    foaf:   "http://xmlns.com/foaf/0.1/",
    cdp:    NS,
}
const prefixedIri = (iri) => shrink(iri, PREFIXES)

export function loadMerge(mergedTtl, provTtl, federationTtl = "") {
    const mergedQuads = parseTtl(mergedTtl)
    const provQuads = parseTtl(provTtl)
    const sourceMeta = federationTtl ? loadSourceMeta(federationTtl) : new Map()

    // Walk provenance: gather reification bnode → inner triple, and bnode → source set,
    // then index (s|p|o) → Set<source>.
    const reifies = parseReifications(provQuads)
    const bnodeSources = new Map()
    for (const q of provQuads) {
        if (q.predicate.value === PROV_DERIVED_FROM) {
            if (!bnodeSources.has(q.subject.value)) bnodeSources.set(q.subject.value, new Set())
            bnodeSources.get(q.subject.value).add(q.object.value)
        }
    }
    // Resolve each record to its :Source via cdp:fromSource (reified in
    // provenance) so downstream code deals only in Source IRIs, not record IRIs.
    const sourceOfRecord = new Map()
    for (const [bnode, triple] of reifies) {
        if (triple.p === FROM_SOURCE) {
            for (const rec of bnodeSources.get(bnode) ?? []) sourceOfRecord.set(rec, triple.o)
        }
    }
    const toSources = (records) => [...new Set([...records].map((r) => sourceOfRecord.get(r)))]

    const provIndex = new Map()
    const tripleKey = (s, p, o) => `${s}\t${p}\t${o}`
    for (const [bnode, triple] of reifies) {
        const sources = bnodeSources.get(bnode)
        if (!sources) continue
        const key = tripleKey(triple.s, triple.p, triple.o)
        if (!provIndex.has(key)) provIndex.set(key, new Set())
        for (const src of sources) provIndex.get(key).add(src)
    }

    // Walk merged.ttl in parse order so card order = pipeline order.
    const orgs = []
    const orgIndex = new Map()
    const fieldIndexByOrg = new Map()
    for (const q of mergedQuads) {
        const orgIri = q.subject.value
        const predIri = q.predicate.value
        const value = q.object.value

        if (!orgIndex.has(orgIri)) {
            orgIndex.set(orgIri, orgs.length)
            fieldIndexByOrg.set(orgIri, new Map())
            orgs.push({ iri: orgIri, label: localName(orgIri), fields: [] })
        }
        const org = orgs[orgIndex.get(orgIri)]
        const fieldIndex = fieldIndexByOrg.get(orgIri)

        if (!fieldIndex.has(predIri)) {
            fieldIndex.set(predIri, org.fields.length)
            org.fields.push({ predicate: predIri, predLabel: prefixedIri(predIri), values: [] })
        }
        const field = org.fields[fieldIndex.get(predIri)]
        const sources = toSources(provIndex.get(tripleKey(orgIri, predIri, value)) ?? [])
        const displayValue = q.object.termType === "NamedNode" ? prefixedIri(value) : value
        field.values.push({ value: displayValue, raw: value, sources })
    }

    // Per-field: sort values by source-count desc so the most-supported one is index 0.
    // Per-org: collect the union of contributing sources, ordered by config.
    for (const org of orgs) {
        for (const f of org.fields) f.values.sort((a, b) => b.sources.length - a.sources.length)
        const all = new Set()
        for (const f of org.fields) for (const v of f.values) for (const s of v.sources) all.add(s)
        org.sources = [...all].sort((a, b) => compareSources(a, b, sourceMeta))
    }
    return orgs
}

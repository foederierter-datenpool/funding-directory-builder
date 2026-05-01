import { Parser } from "n3"

const RDF_REIFIES = "http://www.w3.org/1999/02/22-rdf-syntax-ns#reifies"
const PROV_DERIVED_FROM = "http://www.w3.org/ns/prov#wasDerivedFrom"

const PREFIXES = {
    "http://schema.org/":         "schema",
    "http://www.w3.org/ns/locn#": "locn",
    "http://purl.org/dc/terms/":  "dct",
    "http://xmlns.com/foaf/0.1/": "foaf",
}
const localName = (iri) => iri.replace(/^.*[#/]/, "")
const prefixedIri = (iri) => {
    for (const [ns, p] of Object.entries(PREFIXES)) {
        if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
    }
    return iri
}

export function sourceKind(iri) {
    const local = localName(iri)
    if (local.startsWith("caritas-")) return "caritas"
    if (local.startsWith("sp-"))      return "sp"
    if (local.startsWith("dhs-"))     return "dhs"
    return "other"
}

export { localName }

export function loadMerged(mergedTtl, provTtl) {
    const mergedQuads = new Parser().parse(mergedTtl)
    const provQuads = new Parser().parse(provTtl)

    // Walk provenance: gather reification bnode → inner triple, and bnode → source set,
    // then index (s|p|o) → Set<source>.
    const reifies = new Map()
    const bnodeSources = new Map()
    for (const q of provQuads) {
        if (q.predicate.value === RDF_REIFIES && q.object.termType === "Quad") {
            reifies.set(q.subject.value, {
                s: q.object.subject.value, p: q.object.predicate.value, o: q.object.object.value,
            })
        } else if (q.predicate.value === PROV_DERIVED_FROM) {
            if (!bnodeSources.has(q.subject.value)) bnodeSources.set(q.subject.value, new Set())
            bnodeSources.get(q.subject.value).add(q.object.value)
        }
    }
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
        const sources = [...(provIndex.get(tripleKey(orgIri, predIri, value)) ?? [])]
        field.values.push({ value, sources })
    }

    // Per-field: sort values by source-count desc so the most-supported one is index 0.
    for (const org of orgs) {
        for (const f of org.fields) f.values.sort((a, b) => b.sources.length - a.sources.length)
    }
    return orgs
}

import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const NODE_TYPES = [`${NS}Source`, `${NS}SourceField`, `${NS}TargetField`, `${NS}TargetSchema`, `${NS}TransformNode`]
const SUB_FIELD = `${NS}SubField`
const TRANSFORM = `${NS}TransformNode`

// Prefix map used to render target-predicate IRIs like `schema:identifier`
// instead of their local TargetField name (`t-identifier`).
const PREFIXES = {
    "http://schema.org/":          "schema",
    "http://www.w3.org/ns/locn#":  "locn",
    "http://purl.org/dc/terms/":   "dct",
    "http://xmlns.com/foaf/0.1/":  "foaf",
}

const localName = (iri) => iri.replace(/^.*[#/]/, "")
const prefixedIri = (iri) => {
    for (const [ns, p] of Object.entries(PREFIXES)) {
        if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
    }
    return iri
}

export function loadFederation(ttl, { hideUnmappedFields = true } = {}) {
    const quads = new Parser().parse(ttl)

    const typeOf = new Map()
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE) {
            if (!typeOf.has(q.subject.value)) typeOf.set(q.subject.value, [])
            typeOf.get(q.subject.value).push(q.object.value)
        }
    }

    const nodeSet = new Set()
    for (const [iri, types] of typeOf) {
        if (types.some((t) => NODE_TYPES.includes(t) || t === SUB_FIELD)) nodeSet.add(iri)
    }

    const edges = []
    const push = (from, to, label) => {
        if (nodeSet.has(from) && nodeSet.has(to)) edges.push({ from, to, label })
    }

    // :from and :to on a field-mapping blank node can each carry multiple
    // values (comma-list in turtle), so track them as arrays. :via is
    // single-valued — it routes the mapping through a transform node.
    const bnodeFrom = new Map()
    const bnodeTo   = new Map()
    const bnodeVia  = new Map()
    const appendTo = (map, key, val) => {
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(val)
    }
    const targetPredicate = new Map()
    for (const q of quads) {
        if (q.predicate.value === `${NS}hasField`)         push(q.subject.value, q.object.value, "hasField")
        else if (q.predicate.value === `${NS}hasSubField`) push(q.subject.value, q.object.value, "hasSubField")
        else if (q.predicate.value === `${NS}hasTargetField`) push(q.object.value, q.subject.value, "isTargetFieldOf")
        else if (q.predicate.value === `${NS}from`) appendTo(bnodeFrom, q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}to`)   appendTo(bnodeTo,   q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}via`)  bnodeVia.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}targetPredicate`) targetPredicate.set(q.subject.value, q.object.value)
    }
    // Deduplicate routed edges: the same (source, via) or (via, target) pair
    // can appear across multiple field-mappings sharing one transform node.
    const seen = new Set()
    const pushOnce = (f, t, label) => {
        const k = `${f}|${label}|${t}`
        if (seen.has(k)) return
        seen.add(k)
        push(f, t, label)
    }
    for (const q of quads) {
        if (q.predicate.value === `${NS}hasFieldMapping`) {
            const froms = bnodeFrom.get(q.object.value) ?? []
            const tos   = bnodeTo.get(q.object.value)   ?? []
            const via   = bnodeVia.get(q.object.value)
            if (via) {
                for (const f of froms) pushOnce(f, via, "mapsTo")
                for (const t of tos)   pushOnce(via, t, "mapsTo")
            } else {
                for (const f of froms) for (const t of tos) pushOnce(f, t, "mapsTo")
            }
        }
    }

    // SubFields render in the SourceField column — they're just nested fields.
    const typeFor = (iri) => {
        const ts = typeOf.get(iri) ?? []
        if (ts.includes(SUB_FIELD)) return "SourceField"
        for (const t of NODE_TYPES) if (ts.includes(t)) return localName(t)
        return "Node"
    }

    // Optionally drop SourceField/SubField nodes that don't end up mapped to
    // any target field. A parent field is considered mapped if any of its
    // sub-fields is.
    let visibleEdges = edges
    if (hideUnmappedFields) {
        const mapped = new Set()
        for (const e of edges) if (e.label === "mapsTo") mapped.add(e.from)
        for (const e of edges) if (e.label === "hasSubField" && mapped.has(e.to)) mapped.add(e.from)

        for (const iri of [...nodeSet]) {
            const ts = typeOf.get(iri) ?? []
            const isField = ts.includes(`${NS}SourceField`) || ts.includes(SUB_FIELD)
            if (isField && !mapped.has(iri)) nodeSet.delete(iri)
        }
        visibleEdges = edges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to))
    }

    const labelFor = (iri) => {
        const tp = targetPredicate.get(iri)
        return tp ? prefixedIri(tp) : localName(iri)
    }

    const nodes = [...nodeSet].map((iri) => ({ id: iri, label: labelFor(iri), type: typeFor(iri) }))
    return { nodes, edges: visibleEdges }
}

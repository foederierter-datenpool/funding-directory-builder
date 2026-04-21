import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const NODE_TYPES = [`${NS}Source`, `${NS}SourceField`, `${NS}TargetField`, `${NS}TargetSchema`]

const localName = (iri) => iri.replace(/^.*[#/]/, "")

export function loadFederation(ttl) {
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
        if (types.some((t) => NODE_TYPES.includes(t))) nodeSet.add(iri)
    }

    const edges = []
    const push = (from, to, label) => {
        if (nodeSet.has(from) && nodeSet.has(to)) edges.push({ from, to, label })
    }

    const bnodeFrom = new Map()
    const bnodeTo = new Map()
    for (const q of quads) {
        if (q.predicate.value === `${NS}hasField`) push(q.subject.value, q.object.value, "hasField")
        else if (q.predicate.value === `${NS}hasTargetField`) push(q.object.value, q.subject.value, "isTargetFieldOf")
        else if (q.predicate.value === `${NS}from`) bnodeFrom.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}to`) bnodeTo.set(q.subject.value, q.object.value)
    }
    for (const q of quads) {
        if (q.predicate.value === `${NS}hasFieldMapping`) {
            const f = bnodeFrom.get(q.object.value)
            const t = bnodeTo.get(q.object.value)
            if (f && t) push(f, t, "mapsTo")
        }
    }

    const typeFor = (iri) => {
        const ts = typeOf.get(iri) ?? []
        for (const t of NODE_TYPES) if (ts.includes(t)) return localName(t)
        return "Node"
    }

    const nodes = [...nodeSet].map((iri) => ({ id: iri, label: localName(iri), type: typeFor(iri) }))
    return { nodes, edges }
}

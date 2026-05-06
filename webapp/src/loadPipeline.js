import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const PPLAN_IS_PRECEDED_BY = "http://purl.org/net/p-plan#isPrecededBy"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const STEP_TYPES = ["Fetch", "Lift", "Clean", "Load", "Map", "Match", "Merge", "Resolve"]

const localName = (iri) => iri.replace(/^.*[#/]/, "")

export function loadPipeline(ttl) {
    const quads = new Parser().parse(ttl)
    const stepType = new Map()
    const edges = []
    const propQuads = []
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE) {
            if (q.object.value.startsWith(NS)) {
                const local = q.object.value.slice(NS.length)
                if (STEP_TYPES.includes(local)) stepType.set(q.subject.value, local)
            }
        } else if (q.predicate.value === PPLAN_IS_PRECEDED_BY) {
            edges.push({ from: q.object.value, to: q.subject.value, label: "isPrecededBy" })
        } else {
            propQuads.push(q)
        }
    }
    const propsOf = new Map()
    for (const q of propQuads) {
        if (!stepType.has(q.subject.value)) continue
        if (q.object.termType === "BlankNode") continue
        const key = localName(q.predicate.value)
        const value = q.object.termType === "NamedNode" ? localName(q.object.value) : q.object.value
        if (!propsOf.has(q.subject.value)) propsOf.set(q.subject.value, [])
        propsOf.get(q.subject.value).push({ key, value })
    }
    const nodes = [...stepType].map(([iri, type]) => ({
        id: iri,
        label: localName(iri),
        type,
        props: propsOf.get(iri) ?? [],
    }))
    const visibleEdges = edges.filter((e) => stepType.has(e.from) && stepType.has(e.to))
    return { nodes, edges: visibleEdges }
}

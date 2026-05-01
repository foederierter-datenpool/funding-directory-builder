import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const MATCH_CLUSTER = `${NS}MatchCluster`
const HAS_MEMBER = `${NS}hasMember`

const localName = (iri) => iri.replace(/^.*[#/]/, "")
const labelFor = (iri) => {
    const s = localName(iri)
    return s.length > 18 ? s.slice(0, 16) + "…" : s
}

export function loadMatch(ttl) {
    const quads = new Parser().parse(ttl)

    const clusters = new Set()
    const sources = new Set()
    const edges = []
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE && q.object.value === MATCH_CLUSTER) {
            clusters.add(q.subject.value)
        } else if (q.predicate.value === HAS_MEMBER) {
            sources.add(q.object.value)
            edges.push({ from: q.object.value, to: q.subject.value, label: "hasMember" })
        }
    }

    const nodes = [
        ...[...sources].map((iri) => ({ id: iri, label: labelFor(iri), type: "Source" })),
        ...[...clusters].map((iri) => ({ id: iri, label: labelFor(iri), type: "MatchCluster" })),
    ]
    return { nodes, edges }
}

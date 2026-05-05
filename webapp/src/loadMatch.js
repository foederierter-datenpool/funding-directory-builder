import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const MATCH_CLUSTER = `${NS}MatchCluster`
const HAS_MEMBER = `${NS}hasMember`
const VIA_MANUAL_MATCH = `${NS}viaManualMatch`
const PAIR = `${NS}pair`

const localName = (iri) => iri.replace(/^.*[#/]/, "")
const labelFor = (iri) => {
    const s = localName(iri)
    return s.length > 18 ? s.slice(0, 16) + "…" : s
}

export function loadMatch(ttl, { hideSingletons = false } = {}) {
    const quads = new Parser().parse(ttl)

    // Both sides of a manual owl:sameAs pair get the highlighted edge — the
    // link is symmetric, so picking one direction would be arbitrary.
    const manualEvidence = new Set()
    for (const q of quads) {
        if (q.predicate.value === VIA_MANUAL_MATCH && q.object.value === "true") manualEvidence.add(q.subject.value)
    }
    const manualSources = new Set()
    for (const q of quads) {
        if (q.predicate.value === PAIR && manualEvidence.has(q.subject.value)) manualSources.add(q.object.value)
    }

    const clusters = new Set()
    const memberCount = new Map()
    let edges = []
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE && q.object.value === MATCH_CLUSTER) {
            clusters.add(q.subject.value)
        } else if (q.predicate.value === HAS_MEMBER) {
            memberCount.set(q.subject.value, (memberCount.get(q.subject.value) ?? 0) + 1)
            edges.push({ from: q.object.value, to: q.subject.value, label: "hasMember", manual: manualSources.has(q.object.value) })
        }
    }

    if (hideSingletons) {
        for (const c of [...clusters]) if ((memberCount.get(c) ?? 0) <= 1) clusters.delete(c)
        edges = edges.filter((e) => clusters.has(e.to))
    }

    const sources = new Set(edges.map((e) => e.from))
    const nodes = [
        ...[...sources].map((iri) => ({ id: iri, label: labelFor(iri), type: "Source" })),
        ...[...clusters].map((iri) => ({ id: iri, label: labelFor(iri), type: "MatchCluster" })),
    ]
    return { nodes, edges }
}

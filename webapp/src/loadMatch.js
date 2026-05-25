// Helper for the Match view: turn matches.ttl into a cluster/member graph.
// Reads:  the matches TTL string passed by MatchGraph.jsx
// Does:   returns { nodes, edges } (Source members → MatchCluster)

import { localName, parseTtl, subjectsOfType } from "../../utils.js"

const NS = "https://civic-data.de/pipeline#"
const MATCH_CLUSTER = `${NS}MatchCluster`
const HAS_MEMBER = `${NS}hasMember`

const labelFor = (iri) => {
    const s = localName(iri)
    return s.length > 18 ? s.slice(0, 16) + "…" : s
}

export function loadMatch(ttl, { hideSingletons = false } = {}) {
    const quads = parseTtl(ttl)

    const clusters = subjectsOfType(quads, MATCH_CLUSTER)
    const memberCount = new Map()
    let edges = []
    for (const q of quads) {
        if (q.predicate.value === HAS_MEMBER) {
            memberCount.set(q.subject.value, (memberCount.get(q.subject.value) ?? 0) + 1)
            edges.push({ from: q.object.value, to: q.subject.value, label: "hasMember" })
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

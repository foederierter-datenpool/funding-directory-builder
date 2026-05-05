// Kahn's algorithm: process nodes whose predecessors are all done, breaking
// ties alphabetically for a deterministic ordering. Predecessors that fall
// outside the loaded subset are silently ignored — they're assumed to have
// been handled in an earlier phase (e.g. ingest-side Fetch/Lift before
// pipeline-side Clean/Load).
export const topoSort = (nodes, predsOf) => {
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

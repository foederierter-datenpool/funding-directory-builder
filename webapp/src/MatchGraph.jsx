import ttl from "../../data/pipeline/matches.ttl?raw"
import mappedTtl from "../../data/pipeline/mapped.ttl?raw"
import { loadMatch } from "./loadMatch.js"
import ColumnGraph from "./ColumnGraph.jsx"
import { Parser } from "n3"
import React, { useMemo, useState } from "react"

const COLUMNS = ["Source", "MatchCluster"]
const COLORS = { Source: "#d4e7ff", MatchCluster: "#f4cfe0" }
const CENTER_COLUMNS = ["MatchCluster"]
const SCHEMA_NAME = "http://schema.org/name"
const SCHEMA_IDENTIFIER = "http://schema.org/identifier"
const CDF_NS = "https://civic-data.de/federated-directory#"

const sourceOf = (iri) => iri.match(/[#/](caritas|sp|dhs)-/)?.[1] ?? "other"

const orgInfo = new Map()
for (const q of new Parser().parse(mappedTtl)) {
    const key = q.predicate.value === SCHEMA_NAME ? "name"
              : q.predicate.value === SCHEMA_IDENTIFIER ? "identifier" : null
    if (!key) continue
    const entry = orgInfo.get(q.subject.value) ?? {}
    entry[key] = q.object.value
    orgInfo.set(q.subject.value, entry)
}

export default function MatchGraph() {
    const [hideSingletons, setHideSingletons] = useState(true)

    const { nodes, edges } = useMemo(() => {
        const r = loadMatch(ttl, { hideSingletons })
        const members = new Map()       // cluster -> [memberIris]
        const clusterOf = new Map()     // memberIri -> cluster
        for (const e of r.edges) {
            if (!members.has(e.to)) members.set(e.to, [])
            members.get(e.to).push(e.from)
            clusterOf.set(e.from, e.to)
        }
        for (const n of r.nodes) {
            if (n.type === "Source") {
                n.label = sourceOf(n.id)
                n.subtitle = orgInfo.get(n.id)?.identifier
            } else if (n.type === "MatchCluster") {
                const named = members.get(n.id)?.find((m) => orgInfo.get(m)?.name)
                if (named) n.label = orgInfo.get(named).name
                n.subtitle = n.id.startsWith(CDF_NS) ? `cdf:${n.id.slice(CDF_NS.length)}` : n.id
            }
        }
        // Cluster column is centered on its members' positions, so sorting the
        // source column by cluster size propagates the order to the right.
        const cluster = (n) => n.type === "MatchCluster" ? n.id : clusterOf.get(n.id)
        const size = (cid) => members.get(cid)?.length ?? 1
        r.nodes.sort((a, b) => {
            if (a.type !== b.type) return 0
            const ca = cluster(a), cb = cluster(b)
            return ca && cb ? size(cb) - size(ca) || ca.localeCompare(cb) || a.id.localeCompare(b.id) : 0
        })
        return r
    }, [hideSingletons])

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 1rem", fontSize: 13, borderBottom: "1px solid #ddd" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                    <input type="checkbox" checked={hideSingletons} onChange={(e) => setHideSingletons(e.target.checked)} />
                    Only show clusters
                </label>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <ColumnGraph key={hideSingletons ? "hide" : "show"} nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} centerColumns={CENTER_COLUMNS} />
            </div>
        </div>
    )
}

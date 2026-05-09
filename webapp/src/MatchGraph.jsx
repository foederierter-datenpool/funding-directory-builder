import matchKnowledgeTtl from "../../config/match-knowledge.ttl?raw"
import federationTtl from "../../config/federation.ttl?raw"
import mappedTtl from "../../data/pipeline/mapped.ttl?raw"
import ttl from "../../data/pipeline/matches.ttl?raw"
import React, { useMemo, useState } from "react"
import ColumnGraph from "./ColumnGraph.jsx"
import { loadMatch } from "./loadMatch.js"
import { Parser } from "n3"

const COLUMNS = ["Source", "MatchCluster"]
const COLORS = { Source: "#d4e7ff", MatchCluster: "#f4cfe0" }
const CENTER_COLUMNS = ["MatchCluster"]
const SCHEMA_NAME = "http://schema.org/name"
const SCHEMA_IDENTIFIER = "http://schema.org/identifier"
const CDF_NS = "https://civic-data.de/federated-directory#"
const CDP_NS = "https://civic-data.de/pipeline#"
const HAS_MATCH_CRITERION = `${CDP_NS}hasMatchCriterion`
const ON = `${CDP_NS}on`
const OWL_SAME_AS = "http://www.w3.org/2002/07/owl#sameAs"

const PREFIXES = {
    "http://schema.org/":         "schema",
    "http://purl.org/dc/terms/":  "dct",
    "http://xmlns.com/foaf/0.1/": "foaf",
    [CDP_NS]:                     "cdp",
}
const prefixed = (iri) => {
    for (const [ns, p] of Object.entries(PREFIXES)) if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
    return iri
}

const sourceOf = (iri) => iri.match(/[#/](caritas|sp|dhs)-/)?.[1] ?? "other"

const criteriaPredicates = (() => {
    const quads = new Parser().parse(federationTtl)
    const bnodes = new Set()
    for (const q of quads) if (q.predicate.value === HAS_MATCH_CRITERION) bnodes.add(q.object.value)
    return quads.filter(q => q.predicate.value === ON && bnodes.has(q.subject.value)).map(q => q.object.value)
})()

const orgInfo = new Map()
for (const q of new Parser().parse(mappedTtl)) {
    if (q.object.termType !== "Literal") continue
    const entry = orgInfo.get(q.subject.value) ?? {}
    entry[q.predicate.value] = q.object.value
    orgInfo.set(q.subject.value, entry)
}

const manualPairs = new Parser().parse(matchKnowledgeTtl)
    .filter(q => q.predicate.value === OWL_SAME_AS)
    .map(q => [q.subject.value, q.object.value])

function MemberDetailsModal({ clusterId, memberIris, onClose }) {
    const memberSet = new Set(memberIris)
    const manualHere = manualPairs.filter(([a, b]) => memberSet.has(a) && memberSet.has(b))
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 60, overflowY: "auto" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "white", borderRadius: 6, padding: 20, minWidth: 480, maxWidth: 800, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 14 }}>Cluster <code>{clusterId.startsWith(CDF_NS) ? `cdf:${clusterId.slice(CDF_NS.length)}` : prefixed(clusterId)}</code></h3>
                    <button onClick={onClose} style={{ border: 0, background: "transparent", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>×</button>
                </div>
                {memberIris.map((iri) => {
                    const info = orgInfo.get(iri) ?? {}
                    return (
                        <div key={iri} style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}><code>{prefixed(iri)}</code></div>
                            <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
                                <tbody>
                                    {criteriaPredicates.map((p) => (
                                        <tr key={p}>
                                            <td style={{ padding: "2px 8px", color: "#555", whiteSpace: "nowrap", verticalAlign: "top", width: 1 }}>{prefixed(p)}</td>
                                            <td style={{ padding: "2px 8px" }}>{info[p] ?? <span style={{ color: "#bbb" }}>—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )
                })}
                {manualHere.length > 0 && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #ddd" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Manual matches</div>
                        {manualHere.map(([a, b], i) => (
                            <div key={i} style={{ fontSize: 11, color: "#555", marginBottom: 2 }}>
                                <code>{prefixed(a)}</code> <span style={{ color: "#999" }}>owl:sameAs</span> <code>{prefixed(b)}</code>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default function MatchGraph() {
    const [hideSingletons, setHideSingletons] = useState(true)
    const [openCluster, setOpenCluster] = useState(null)

    const { nodes, edges, members, clusterOf } = useMemo(() => {
        const r = loadMatch(ttl, { hideSingletons })
        const members = new Map()
        const clusterOf = new Map()
        for (const e of r.edges) {
            if (!members.has(e.to)) members.set(e.to, [])
            members.get(e.to).push(e.from)
            clusterOf.set(e.from, e.to)
        }
        for (const n of r.nodes) {
            if (n.type === "Source") {
                n.label = sourceOf(n.id)
                n.subtitle = orgInfo.get(n.id)?.[SCHEMA_IDENTIFIER]
            } else if (n.type === "MatchCluster") {
                const named = members.get(n.id)?.find((m) => orgInfo.get(m)?.[SCHEMA_NAME])
                if (named) n.label = orgInfo.get(named)[SCHEMA_NAME]
                n.subtitle = n.id.startsWith(CDF_NS) ? `cdf:${n.id.slice(CDF_NS.length)}` : n.id
            }
        }
        const cluster = (n) => n.type === "MatchCluster" ? n.id : clusterOf.get(n.id)
        const size = (cid) => members.get(cid)?.length ?? 1
        r.nodes.sort((a, b) => {
            if (a.type !== b.type) return 0
            const ca = cluster(a), cb = cluster(b)
            return ca && cb ? size(cb) - size(ca) || ca.localeCompare(cb) || a.id.localeCompare(b.id) : 0
        })
        return { ...r, members, clusterOf }
    }, [hideSingletons])

    const handleNodeClick = (_, node) => {
        const cid = members.has(node.id) ? node.id : clusterOf.get(node.id)
        if (cid) setOpenCluster({ clusterId: cid, memberIris: members.get(cid) ?? [] })
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 1rem", fontSize: 13, borderBottom: "1px solid #ddd" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                    <input type="checkbox" checked={hideSingletons} onChange={(e) => setHideSingletons(e.target.checked)} />
                    Only show clusters
                </label>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <ColumnGraph key={hideSingletons ? "hide" : "show"} nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} centerColumns={CENTER_COLUMNS} onNodeClick={handleNodeClick} />
            </div>
            {openCluster && <MemberDetailsModal clusterId={openCluster.clusterId} memberIris={openCluster.memberIris} onClose={() => setOpenCluster(null)} />}
        </div>
    )
}

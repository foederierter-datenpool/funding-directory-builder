import ttl from "../../data/pipeline/matches.ttl?raw"
import { loadMatch } from "./loadMatch.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React, { useMemo, useState } from "react"

const COLUMNS = ["Source", "MatchCluster"]
const COLORS = { Source: "#d4e7ff", MatchCluster: "#f4cfe0" }
const CENTER_COLUMNS = ["MatchCluster"]

export default function MatchGraph() {
    const [hideSingletons, setHideSingletons] = useState(false)

    const { nodes, edges } = useMemo(() => loadMatch(ttl, { hideSingletons }), [hideSingletons])

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

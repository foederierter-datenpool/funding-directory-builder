import ttl from "../../config/federation.ttl?raw"
import { loadMap, loadSources } from "./loadMap.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React, { useMemo, useState } from "react"

const COLUMNS = ["Source", "SourceField", "TransformNode", "TargetField", "TargetSchema"]
const COLORS = {
    Source: "#d4e7ff",
    SourceField: "#e6f3d8",
    TransformNode: "#fff1a8",
    TargetField: "#fde2c7",
    TargetSchema: "#f4cfe0",
}

const SOURCES = loadSources(ttl)

export default function MapGraph() {
    const [hidden, setHidden] = useState(() => new Set())

    const toggle = (iri) => {
        const next = new Set(hidden)
        if (next.has(iri)) next.delete(iri); else next.add(iri)
        setHidden(next)
    }

    const { nodes, edges } = useMemo(() => loadMap(ttl, { hiddenSources: hidden }), [hidden])
    const graphKey = useMemo(() => [...hidden].sort().join("|"), [hidden])

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 1rem", fontSize: 13, borderBottom: "1px solid #ddd" }}>
                {SOURCES.map((s) => (
                    <label key={s.iri} style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                        <input type="checkbox" checked={!hidden.has(s.iri)} onChange={() => toggle(s.iri)} />
                        {s.label}
                    </label>
                ))}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <ColumnGraph key={graphKey} nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} />
            </div>
        </div>
    )
}

import ttl from "../../config/federation.ttl?raw"
import { loadMap, loadSources } from "./loadMap.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React, { useEffect, useMemo, useRef, useState } from "react"

const COLUMNS = ["Source", "SourceField", "TransformNode", "TargetField", "TargetSchema"]
const COLORS = {
    Source: "#d4e7ff",
    SourceField: "#e6f3d8",
    TransformNode: "#fff1a8",
    TargetField: "#fde2c7",
    TargetSchema: "#f4cfe0",
}

const SOURCES = loadSources(ttl)

function SourcesDropdown({ visible, onChange }) {
    const [open, setOpen] = useState(false)
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
        document.addEventListener("mousedown", onDown)
        return () => document.removeEventListener("mousedown", onDown)
    }, [open])

    const summary = visible.size === SOURCES.length
        ? "All sources"
        : visible.size === 0
            ? "No sources"
            : `${visible.size} of ${SOURCES.length} sources`

    const toggle = (iri) => {
        const next = new Set(visible)
        if (next.has(iri)) next.delete(iri); else next.add(iri)
        onChange(next)
    }
    const setAll = (on) => onChange(on ? new Set(SOURCES.map(s => s.iri)) : new Set())

    const linkBtn = { background: "none", border: "none", color: "#06c", cursor: "pointer", padding: 0, fontSize: 12 }

    return (
        <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setOpen(!open)} style={{ padding: "0.25rem 0.6rem", border: "1px solid #aaa", borderRadius: 4, background: "white", cursor: "pointer", fontSize: 13 }}>
                {summary} ▾
            </button>
            {open && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 10, background: "white", border: "1px solid #aaa", borderRadius: 4, padding: 6, minWidth: 200, boxShadow: "0 2px 6px rgba(0,0,0,0.12)" }}>
                    <div style={{ display: "flex", gap: 12, paddingBottom: 4, marginBottom: 4, borderBottom: "1px solid #eee" }}>
                        <button onClick={() => setAll(true)} style={linkBtn}>Select all</button>
                        <button onClick={() => setAll(false)} style={linkBtn}>Unselect all</button>
                    </div>
                    {SOURCES.map(s => (
                        <label key={s.iri} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                            <input type="checkbox" checked={visible.has(s.iri)} onChange={() => toggle(s.iri)} />
                            {s.label}
                        </label>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function MapGraph() {
    const [visible, setVisible] = useState(() => new Set(SOURCES.map(s => s.iri)))

    const { nodes, edges } = useMemo(() => {
        const hiddenSources = new Set(SOURCES.filter(s => !visible.has(s.iri)).map(s => s.iri))
        return loadMap(ttl, { hiddenSources })
    }, [visible])
    const graphKey = useMemo(() => [...visible].sort().join("|"), [visible])

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 1rem", fontSize: 13, borderBottom: "1px solid #ddd" }}>
                <SourcesDropdown visible={visible} onChange={setVisible} />
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
                <ColumnGraph key={graphKey} nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} />
            </div>
        </div>
    )
}

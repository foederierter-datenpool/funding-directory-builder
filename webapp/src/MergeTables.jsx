import { loadMerge, sourceKind, localName } from "./loadMerge.js"
import Card, { KeyValueTable } from "./Card.jsx"
import provTtl from "../../data/pipeline/provenance.ttl?raw"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import React, { useState } from "react"

const SOURCE_ABBR = { caritas: "ca", sp: "sp", dhs: "dhs", other: "?" }
const orgs = loadMerge(mergedTtl, provTtl)

const CONFLICT_LEVELS = [
    { color: "#fca5a5", width: 2, bg: "rgba(220, 38, 38, 0.08)" },
    { color: "#f87171", width: 3, bg: "rgba(220, 38, 38, 0.16)" },
    { color: "#ef4444", width: 4, bg: "rgba(220, 38, 38, 0.24)" },
    { color: "#b91c1c", width: 5, bg: "rgba(220, 38, 38, 0.32)" },
]
const conflictStyle = (n) => {
    if (n <= 1) return undefined
    const lvl = CONFLICT_LEVELS[Math.min(n - 2, CONFLICT_LEVELS.length - 1)]
    return {
        outline: `${lvl.width}px solid ${lvl.color}`,
        borderRadius: 2,
        backgroundColor: lvl.bg,
        padding: "0 4px",
        marginRight: 6,
    }
}

function SourceTags({ sources }) {
    return (
        <>
            {sources.map((iri, i) => (
                <span key={i} className="source-tag" title={localName(iri)}>{SOURCE_ABBR[sourceKind(iri)]}</span>
            ))}
        </>
    )
}

function ValueCell({ values, highlight }) {
    const [idx, setIdx] = useState(0)
    const cur = values[idx]
    const multi = values.length > 1
    const style = highlight ? conflictStyle(values.length) : undefined
    return (
        <>
            {multi && (
                <span className="flip">
                    <button className="flip-btn" onClick={() => setIdx((idx - 1 + values.length) % values.length)}>◀</button>
                    <span className="flip-counter">{idx + 1}/{values.length}</span>
                    <button className="flip-btn" onClick={() => setIdx((idx + 1) % values.length)}>▶</button>
                </span>
            )}
            <span className="value-text" title={cur.value} style={style}>{cur.value}</span>
            <SourceTags sources={cur.sources} />
        </>
    )
}

function OrgCardNarrow({ org, highlight }) {
    return <KeyValueTable rows={org.fields.map((f) => ({ key: f.predicate, label: f.predLabel, value: <ValueCell values={f.values} highlight={highlight} /> }))} />
}

function OrgCardWide({ org, highlight }) {
    const sources = org.sourceOrgs
    return (
        <table>
            <thead>
                <tr>
                    <th></th>
                    {sources.map((s) => (
                        <th key={s} title={localName(s)}>
                            <span className="source-tag">{SOURCE_ABBR[sourceKind(s)]}</span>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {org.fields.map((f) => {
                    const conflict = highlight ? conflictStyle(f.values.length) : undefined
                    return (
                        <tr key={f.predicate}>
                            <td>{f.predLabel}</td>
                            {sources.map((s) => {
                                const v = f.values.find((val) => val.sources.includes(s))
                                return <td key={s} title={v?.value}><span className="value-text" style={{ maxWidth: "50ch", ...conflict }}>{v?.value ?? ""}</span></td>
                            })}
                        </tr>
                    )
                })}
            </tbody>
        </table>
    )
}

function OrgCard({ org, compact, highlight }) {
    return (
        <Card title={org.label}>
            {compact ? <OrgCardNarrow org={org} highlight={highlight} /> : <OrgCardWide org={org} highlight={highlight} />}
        </Card>
    )
}

export default function MergeTables() {
    const [compact, setCompact] = useState(true)
    const [highlight, setHighlight] = useState(true)
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", fontSize: 13 }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                    Compact view
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <input type="checkbox" checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
                    Highlight conflicts
                </label>
            </div>
            {orgs.map((org) => <OrgCard key={org.iri} org={org} compact={compact} highlight={highlight} />)}
        </div>
    )
}

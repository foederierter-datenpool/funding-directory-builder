import { loadMerge, sourceKind, localName } from "./loadMerge.js"
import provTtl from "../../data/pipeline/provenance.ttl?raw"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import finalTtl from "../../data/pipeline/final.ttl?raw"
import logTtl from "../../data/ingest/ingest-log.ttl?raw"
import Card, { KeyValueTable } from "./Card.jsx"
import React, { useState } from "react"
import { Parser } from "n3"

const SOURCE_ABBR = { caritas: "ca", sp: "sp", dhs: "dhs", other: "?" }
const SOURCE_LOCAL_TO_KIND = { caritasSource: "caritas", sozialplattformSource: "sp", dhsSource: "dhs" }
const harvestTimeByKind = (() => {
    const bnodeKind = new Map(), bnodeTime = new Map()
    for (const q of new Parser().parse(logTtl)) {
        if (q.predicate.value === "https://civic-data.de/pipeline#ofSource") {
            bnodeKind.set(q.subject.value, SOURCE_LOCAL_TO_KIND[localName(q.object.value)] ?? "other")
        } else if (q.predicate.value === "http://www.w3.org/ns/prov#atTime") {
            bnodeTime.set(q.subject.value, q.object.value)
        }
    }
    const out = {}
    for (const [b, kind] of bnodeKind) {
        const t = bnodeTime.get(b)
        if (t && (!out[kind] || t > out[kind])) out[kind] = t
    }
    return out
})()
const tagTitle = (iri) => {
    const t = harvestTimeByKind[sourceKind(iri)]
    return t ? `${localName(iri)}\n\nharvested ${t.slice(0, 19).replace("T", " ")}` : localName(iri)
}
const EXPECTED_MULTI = new Set(["http://schema.org/identifier", "https://civic-data.de/pipeline#fromSource"])
const isConflict = (f) => !EXPECTED_MULTI.has(f.predicate) && f.values.length > 1
// Sort alphabetically on the MatchCluster IRI so the order is stable whether "Show final version" is active or not
const byIri = (a, b) => a.iri.localeCompare(b.iri)
const orgs = loadMerge(mergedTtl, provTtl).sort(byIri)
const finalOrgs = loadMerge(finalTtl, "").sort(byIri)

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
                <span key={i} className="source-tag" title={tagTitle(iri)}>{SOURCE_ABBR[sourceKind(iri)]}</span>
            ))}
        </>
    )
}

function ValueCell({ values, highlight }) {
    const [idx, setIdx] = useState(0)
    // idx persists across re-renders, so clamp when `values` shrinks (e.g. flipping
    // to final.ttl where every (s,p) has exactly one value).
    const safeIdx = idx % values.length
    const cur = values[safeIdx]
    const multi = values.length > 1
    const style = highlight ? conflictStyle(values.length) : undefined
    return (
        <>
            {multi && (
                <span className="flip">
                    <button className="flip-btn" onClick={() => setIdx((safeIdx - 1 + values.length) % values.length)}>◀</button>
                    <span className="flip-counter">{safeIdx + 1}/{values.length}</span>
                    <button className="flip-btn" onClick={() => setIdx((safeIdx + 1) % values.length)}>▶</button>
                </span>
            )}
            <span className="value-text" title={cur.raw ?? cur.value} style={style}>{cur.value}</span>
            <SourceTags sources={cur.sources} />
        </>
    )
}

function OrgCardNarrow({ org, highlight }) {
    return <KeyValueTable rows={org.fields.map((f) => ({ key: f.predicate, label: f.predLabel, value: <ValueCell values={f.values} highlight={highlight && isConflict(f)} /> }))} />
}

function OrgCardWide({ org, highlight }) {
    const sources = org.sourceOrgs
    return (
        <table>
            <thead>
                <tr>
                    <th></th>
                    {sources.map((s) => (
                        <th key={s} title={tagTitle(s)}>
                            <span className="source-tag">{SOURCE_ABBR[sourceKind(s)]}</span>
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {org.fields.map((f) => {
                    const conflict = highlight && isConflict(f) ? conflictStyle(f.values.length) : undefined
                    return (
                        <tr key={f.predicate}>
                            <td>{f.predLabel}</td>
                            {sources.map((s) => {
                                const v = f.values.find((val) => val.sources.includes(s))
                                return <td key={s} title={v?.raw ?? v?.value}><span className="value-text" style={{ maxWidth: "50ch", ...conflict }}>{v?.value ?? ""}</span></td>
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
    const [showFinal, setShowFinal] = useState(false)
    const display = showFinal ? finalOrgs : orgs
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "0.75rem", fontSize: 13 }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: showFinal ? "#bbb" : "#000" }}>
                    <input type="checkbox" disabled={showFinal} checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                    Compact view
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", color: showFinal ? "#bbb" : "#000" }}>
                    <input type="checkbox" disabled={showFinal} checked={highlight} onChange={(e) => setHighlight(e.target.checked)} />
                    Highlight conflicts
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    <input type="checkbox" checked={showFinal} onChange={(e) => setShowFinal(e.target.checked)} />
                    Show final version
                </label>
            </div>
            {display.map((org) => <OrgCard key={org.iri} org={org} compact={showFinal || compact} highlight={!showFinal && highlight} />)}
        </div>
    )
}

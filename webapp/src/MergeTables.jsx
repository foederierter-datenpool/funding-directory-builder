import { loadMerge, sourceKind, localName } from "./loadMerge.js"
import Card, { KeyValueTable } from "./Card.jsx"
import provTtl from "../../data/pipeline/provenance.ttl?raw"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import React, { useState } from "react"

const SOURCE_ABBR = { caritas: "ca", sp: "sp", dhs: "dhs", other: "?" }
const orgs = loadMerge(mergedTtl, provTtl)

function SourceTags({ sources }) {
    return (
        <>
            {sources.map((iri, i) => (
                <span key={i} className="source-tag" title={localName(iri)}>{SOURCE_ABBR[sourceKind(iri)]}</span>
            ))}
        </>
    )
}

function ValueCell({ values }) {
    const [idx, setIdx] = useState(0)
    const cur = values[idx]
    const multi = values.length > 1
    return (
        <>
            {multi && (
                <span className="flip">
                    <button className="flip-btn" onClick={() => setIdx((idx - 1 + values.length) % values.length)}>◀</button>
                    <span className="flip-counter">{idx + 1}/{values.length}</span>
                    <button className="flip-btn" onClick={() => setIdx((idx + 1) % values.length)}>▶</button>
                </span>
            )}
            <span className="value-text" title={cur.value}>{cur.value}</span>
            <SourceTags sources={cur.sources} />
        </>
    )
}

function OrgCardNarrow({ org }) {
    return <KeyValueTable rows={org.fields.map((f) => ({ key: f.predicate, label: f.predLabel, value: <ValueCell values={f.values} /> }))} />
}

function OrgCardWide({ org }) {
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
                {org.fields.map((f) => (
                    <tr key={f.predicate}>
                        <td>{f.predLabel}</td>
                        {sources.map((s) => {
                            const v = f.values.find((val) => val.sources.includes(s))
                            return <td key={s} title={v?.value}><span className="value-text" style={{ maxWidth: "50ch" }}>{v?.value ?? ""}</span></td>
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

function OrgCard({ org, compact }) {
    return (
        <Card title={org.label}>
            {compact ? <OrgCardNarrow org={org} /> : <OrgCardWide org={org} />}
        </Card>
    )
}

export default function MergeTables() {
    const [compact, setCompact] = useState(true)
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginBottom: "0.75rem", fontSize: 13 }}>
                <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                Compact view
            </label>
            {orgs.map((org) => <OrgCard key={org.iri} org={org} compact={compact} />)}
        </div>
    )
}

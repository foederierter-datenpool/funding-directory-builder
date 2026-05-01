import { loadMerge, sourceKind, localName } from "./loadMerge.js"
import provTtl from "../../data/out/provenance.ttl?raw"
import mergedTtl from "../../data/out/merged.ttl?raw"
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

function OrgCard({ org }) {
    return (
        <div className="org-card">
            <div className="org-card-header">
                <code>{org.label}</code>
            </div>
            <table>
                <tbody>
                    {org.fields.map((f) => (
                        <tr key={f.predicate}>
                            <td>{f.predLabel}</td>
                            <td><ValueCell values={f.values} /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default function MergeTables() {
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            {orgs.map((org) => <OrgCard key={org.iri} org={org} />)}
        </div>
    )
}

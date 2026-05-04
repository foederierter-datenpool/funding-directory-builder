import { turtleToJsonLdObj } from "@foerderfunke/sem-ops-utils"
import federationTtl from "../../config/federation.ttl?raw"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import { Parser, Writer } from "n3"
import React, { useState } from "react"

const PREFIXES = {
    schema: "http://schema.org/",
    foaf:   "http://xmlns.com/foaf/0.1/",
    dct:    "http://purl.org/dc/terms/",
    cdf:    "https://civic-data.de/federated-directory#",
}
const prefixedIri = (iri) => {
    for (const [p, ns] of Object.entries(PREFIXES)) {
        if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
    }
    return iri
}

const PIPELINE_NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"

function readTargetFields() {
    const quads = new Parser().parse(federationTtl)
    const fieldOrder = []
    const seen = new Set()
    const isTargetField = new Set()
    const predicateOf = new Map()
    for (const q of quads) {
        if (q.predicate.value === `${PIPELINE_NS}hasTargetField`) {
            if (!seen.has(q.object.value)) { seen.add(q.object.value); fieldOrder.push(q.object.value) }
        } else if (q.predicate.value === RDF_TYPE && q.object.value === `${PIPELINE_NS}TargetField`) {
            isTargetField.add(q.subject.value)
        } else if (q.predicate.value === `${PIPELINE_NS}targetPredicate`) {
            predicateOf.set(q.subject.value, q.object.value)
        }
    }
    return fieldOrder
        .filter((iri) => isTargetField.has(iri) && predicateOf.has(iri))
        .map((iri) => ({ predicate: predicateOf.get(iri), label: prefixedIri(predicateOf.get(iri)) }))
}

const TARGET_FIELDS = readTargetFields()
const MERGED_QUADS = new Parser().parse(mergedTtl)

const FORMATS = [
    { value: "ttl",    label: "Turtle (.ttl)",     ext: "ttl",    mime: "text/turtle" },
    { value: "jsonld", label: "JSON-LD (.jsonld)", ext: "jsonld", mime: "application/ld+json" },
    { value: "csv",    label: "CSV (.csv)",        ext: "csv",    mime: "text/csv" },
]

const writeTurtle = (quads) => new Promise((resolve, reject) => {
    const writer = new Writer({ prefixes: PREFIXES })
    for (const q of quads) writer.addQuad(q)
    writer.end((err, result) => err ? reject(err) : resolve(result))
})

const csvEscape = (v) => /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

function buildCsv(quads, fields) {
    const subjects = []
    const bySubject = new Map()
    for (const q of quads) {
        const s = q.subject.value
        if (!bySubject.has(s)) { bySubject.set(s, new Map()); subjects.push(s) }
        const row = bySubject.get(s)
        if (!row.has(q.predicate.value)) row.set(q.predicate.value, [])
        row.get(q.predicate.value).push(q.object.value)
    }
    const header = ["iri", ...fields.map((f) => f.label)]
    const lines = [header.map(csvEscape).join(",")]
    for (const s of subjects) {
        const row = bySubject.get(s)
        const cells = [s, ...fields.map((f) => (row.get(f.predicate) ?? []).join("; "))]
        lines.push(cells.map(csvEscape).join(","))
    }
    return lines.join("\n") + "\n"
}

async function buildFile(selectedFields, format) {
    const allowed = new Set(selectedFields.map((f) => f.predicate))
    const filtered = MERGED_QUADS.filter((q) => allowed.has(q.predicate.value))
    if (format === "csv") return buildCsv(filtered, selectedFields)
    const ttl = await writeTurtle(filtered)
    if (format === "ttl") return ttl
    const jsonld = await turtleToJsonLdObj(ttl)
    return JSON.stringify(jsonld, null, 2)
}

function triggerDownload(content, mime, filename) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
}

export default function Download() {
    const [selected, setSelected] = useState(() => new Set(TARGET_FIELDS.map((f) => f.predicate)))
    const [format, setFormat] = useState("ttl")

    const toggle = (pred) => {
        const next = new Set(selected)
        if (next.has(pred)) next.delete(pred); else next.add(pred)
        setSelected(next)
    }

    const onDownload = async () => {
        const fmt = FORMATS.find((f) => f.value === format)
        const fields = TARGET_FIELDS.filter((f) => selected.has(f.predicate))
        const content = await buildFile(fields, format)
        triggerDownload(content, fmt.mime, `merged.${fmt.ext}`)
    }

    return (
        <div className="page" style={{ fontSize: 14 }}>
            <div style={{ marginBottom: "0.5rem", fontWeight: "bold" }}>Fields to include:</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, lineHeight: 1.8 }}>
                {TARGET_FIELDS.map((f) => (
                    <li key={f.predicate}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                            <input type="checkbox" checked={selected.has(f.predicate)} onChange={() => toggle(f.predicate)} />
                            <code>{f.label}</code>
                        </label>
                    </li>
                ))}
            </ul>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontWeight: "bold" }}>Format:</span>
                    <select value={format} onChange={(e) => setFormat(e.target.value)}>
                        {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                </label>
                <button onClick={onDownload} disabled={selected.size === 0}>Download</button>
            </div>
        </div>
    )
}

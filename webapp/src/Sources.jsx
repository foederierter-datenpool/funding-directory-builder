import federationTtl from "../../config/federation.ttl?raw"
import pipelineTtl from "../../config/pipeline.ttl?raw"
import mappedTtl from "../../data/pipeline/mapped.ttl?raw"
import ingestLogTtl from "../../data/ingest/ingest-log.ttl?raw"
import Card, { KeyValueTable } from "./Card.jsx"
import { loadSources } from "./loadSources.js"
import React from "react"

const sources = loadSources(federationTtl, pipelineTtl, mappedTtl, ingestLogTtl)

const formatTime = (iso) => iso
    ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—"

export default function Sources() {
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            {sources.map((s) => (
                <Card key={s.iri} title={s.label ?? s.iri}>
                    <KeyValueTable rows={[
                        { key: "url",       label: "URL",            value: <a href={s.fetchUrl} target="_blank" rel="noreferrer">{s.fetchUrl}</a> },
                        { key: "format",    label: "Format",         value: s.format },
                        { key: "harvested", label: "Last harvested", value: formatTime(s.lastHarvestedAt) },
                        { key: "records",   label: "Records",        value: s.records },
                        { key: "fields",    label: "Schema fields",  value: `${s.mappedFields} mapped / ${s.totalFields} total` },
                    ]} />
                </Card>
            ))}
        </div>
    )
}

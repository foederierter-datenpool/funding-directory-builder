import federationTtl from "../../config/federation.ttl?raw"
import pipelineTtl from "../../config/pipeline.ttl?raw"
import mappedTtl from "../../data/out/mapped.ttl?raw"
import Card, { KeyValueTable } from "./Card.jsx"
import { loadSources } from "./loadSources.js"
import React from "react"

const sources = loadSources(federationTtl, pipelineTtl, mappedTtl)

export default function Sources() {
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            {sources.map((s) => (
                <Card key={s.iri} title={s.label ?? s.iri}>
                    <KeyValueTable rows={[
                        { key: "url",     label: "URL",           value: <a href={s.fetchUrl} target="_blank" rel="noreferrer">{s.fetchUrl}</a> },
                        { key: "format",  label: "Format",        value: s.format },
                        { key: "records", label: "Records",       value: s.records },
                        { key: "fields",  label: "Schema fields", value: `${s.mappedFields} mapped / ${s.totalFields} total` },
                    ]} />
                </Card>
            ))}
        </div>
    )
}

import federationTtl from "../../config/federation.ttl?raw"
import pipelineTtl from "../../config/pipeline.ttl?raw"
import Card, { KeyValueTable } from "./Card.jsx"
import { loadSources } from "./loadSources.js"
import React from "react"

const sources = loadSources(federationTtl, pipelineTtl)

export default function Sources() {
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            {sources.map((s) => (
                <Card key={s.iri} title={s.label ?? s.iri}>
                    <KeyValueTable rows={[
                        { key: "url",    label: "URL",    value: <a href={s.fetchUrl} target="_blank" rel="noreferrer">{s.fetchUrl}</a> },
                        { key: "format", label: "Format", value: s.format },
                    ]} />
                </Card>
            ))}
        </div>
    )
}

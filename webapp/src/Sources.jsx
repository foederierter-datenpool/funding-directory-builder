import federationTtl from "../../config/federation.ttl?raw"
import pipelineTtl from "../../config/pipeline.ttl?raw"
import mappedTtl from "../../data/pipeline/mapped.ttl?raw"
import ingestLogTtl from "../../data/ingest/ingest-log.ttl?raw"
import Card, { KeyValueTable } from "./Card.jsx"
import { loadSources } from "./loadSources.js"
import React from "react"

const sources = loadSources(federationTtl, pipelineTtl, mappedTtl, ingestLogTtl)

// Static-file sources have no live URL; link to their committed folder on GitHub.
const REPO_TREE = "https://github.com/foederierter-datenpool/directory-builder/tree/main"

const formatTime = (iso) => iso
    ? new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—"

const sourceUrl = (s) => {
    if (s.fetchUrl) return <a href={s.fetchUrl} target="_blank" rel="noreferrer">{s.fetchUrl}</a>
    if (s.staticSource) return (
        <a href={`${REPO_TREE}/${s.staticSource.replace(/\/$/, "")}`} target="_blank" rel="noreferrer">static sources</a>
    )
    return "—"
}

// Commit times of static-source folders, injected at build time (see vite.config.js).
const STATIC_COMMITS = __STATIC_SOURCE_COMMITS__

// Live sources report when they were last harvested; static sources have no
// harvest, so show the commit time of when their files entered the repo.
const freshnessRow = (s) => s.staticSource
    ? { key: "added",     label: "Added to repo",  value: formatTime(STATIC_COMMITS[s.staticSource.replace(/\/$/, "")]) }
    : { key: "harvested", label: "Last harvested", value: formatTime(s.lastHarvestedAt) }

export default function Sources() {
    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            {sources.map((s) => (
                <Card key={s.iri} title={s.label ?? s.iri}>
                    <KeyValueTable rows={[
                        { key: "url",       label: "URL",            value: sourceUrl(s) },
                        { key: "format",    label: "Format",         value: s.format },
                        freshnessRow(s),
                        { key: "records",   label: "Records",        value: s.records },
                        { key: "fields",    label: "Schema fields",  value: `${s.mappedFields} mapped / ${s.totalFields} total` },
                    ]} />
                </Card>
            ))}
        </div>
    )
}

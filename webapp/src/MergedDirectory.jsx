import ttl from "../../data/out/merged.ttl?raw"
import React from "react"

const SRC = `${import.meta.env.BASE_URL}data/out/merged.ttl`

export default function MergedDirectory() {
    return (
        <div style={{ padding: "1rem" }}>
            <p>Source: <a href={SRC}>{SRC}</a></p>
            <pre>{ttl}</pre>
        </div>
    )
}

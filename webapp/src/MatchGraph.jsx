import ttl from "../../data/out/matches.ttl?raw"
import React from "react"

const SRC = `${import.meta.env.BASE_URL}data/out/matches.ttl`

export default function MatchGraph() {
    return (
        <div style={{ padding: "1rem" }}>
            <p>Source: <a href={SRC}>{SRC}</a></p>
            <pre>{ttl}</pre>
        </div>
    )
}

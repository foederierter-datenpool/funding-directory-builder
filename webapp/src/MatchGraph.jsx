import ttl from "../../data/out/matches.ttl?raw"
import React from "react"

export default function MatchGraph() {
    return <pre style={{ padding: "1rem" }}>{ttl}</pre>
}

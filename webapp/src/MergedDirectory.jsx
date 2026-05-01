import ttl from "../../data/out/merged.ttl?raw"
import React from "react"

export default function MergedDirectory() {
    return <pre style={{ padding: "1rem" }}>{ttl}</pre>
}

import { sparqlSelect, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import provTtl from "../../data/pipeline/provenance.ttl?raw"
import mergedTtl from "../../data/pipeline/merged.ttl?raw"
import React, { useState } from "react"

const store = storeFromTurtles([mergedTtl, provTtl])

const DEFAULT_QUERY = `SELECT * WHERE { ?s ?p ?o } LIMIT 10`

export default function Query() {
    const [query, setQuery] = useState(DEFAULT_QUERY)
    const [output, setOutput] = useState("")
    const [running, setRunning] = useState(false)

    const run = async () => {
        setRunning(true)
        try {
            const rows = await sparqlSelect(query, [store])
            setOutput(JSON.stringify(rows, null, 2))
        } catch (e) {
            setOutput(`Error: ${e.message ?? e}`)
        } finally {
            setRunning(false)
        }
    }

    return (
        <div className="page" style={{ overflowY: "auto", height: "100%" }}>
            <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ width: "100%", minHeight: 160, fontFamily: "monospace", fontSize: 13, padding: "0.5rem", boxSizing: "border-box" }}
            />
            <div style={{ margin: "0.5rem 0" }}>
                <button onClick={run} disabled={running} style={{ fontSize: 13, padding: "0.3rem 0.8rem" }}>
                    {running ? "Running…" : "Run query"}
                </button>
            </div>
            <pre style={{ background: "#f5f5f5", padding: "0.75rem", fontSize: 12, overflow: "auto" }}>{output}</pre>
        </div>
    )
}

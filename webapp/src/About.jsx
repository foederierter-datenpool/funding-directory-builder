import React from "react"

export default function About() {
    return (
        <div className="page" style={{ maxWidth: "60ch", lineHeight: 1.5 }}>
            <h1 style={{ marginTop: 0 }}>Federated Directory</h1>
            <p>Builds a federated directory from multiple input sources.</p>
            <p>The resulting directory can be queried, downloaded, or accessed via APIs.</p>
            <p>Anyone working on the federation process - or curious about it - can toggle <i>Show federation process</i> in the top bar to inspect the individual steps.</p>
        </div>
    )
}

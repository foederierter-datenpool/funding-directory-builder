import React from "react"

export default function About() {
    return (
        <div className="page" style={{ maxWidth: "100ch", lineHeight: 1.5 }}>
            <h2>Federated directory of funding programmes in Germany & the EU</h2>
            <p>Builds a federated directory of funding opportunities (Förderprogramme) by mapping heterogeneous source schemas into a unified target schema.<br/>Sources: Förderdatenbank des Bundes, DSEE-Förderdatenbank, Förderfinder Bayern, and the EU Funding &amp; Tenders Portal.<br/>The directory can be queried, downloaded, or accessed via APIs.<br/>This site serves both its users and those interested in the federation process itself.<br/>Toggle "Show federation process" in the top bar to inspect the steps.</p>

            <details style={{ marginTop: "2rem" }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "#666" }}>Technical roadmap</summary>

                <p><strong>Semantic modelling</strong></p>
                <ul>
                    <li>Richer target schema: eligibility, funding amount, deadlines, applicant types, region</li>
                    <li>Match the same programme across sources (currently every record is its own entry)</li>
                    <li>Strategy for minting stable IRIs for entities of the federated directory</li>
                    <li>Complement <i>sameAs</i> with <i>differentFrom</i> to manually avoid false matches</li>
                </ul>

                <p><strong>Scope</strong></p>
                <ul>
                    <li>Wider coverage, eventually nationwide</li>
                    <li>More sources</li>
                    <li>Richer and more mature target schema</li>
                </ul>

                <p><strong>Operation</strong></p>
                <ul>
                    <li>Periodic runs: handle change and addition while keeping minted entities stable where possible</li>
                    <li>More resolve strategies for the step from merge to final directory</li>
                </ul>

                <p><strong>Output</strong></p>
                <ul>
                    <li>List discrepancies and build reports for source operators: <i>here's where your records disagree with other sources</i></li>
                    <li>Public APIs: OpenAPI and SPARQL endpoints</li>
                </ul>
            </details>
        </div>
    )
}

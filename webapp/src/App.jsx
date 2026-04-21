import { HashRouter, Routes, Route, Link } from "react-router-dom"
import FederationGraph from "./FederationGraph.jsx"
import React from "react"

function Nav() {
    return (
        <nav style={{ padding: "0.3rem 0.75rem", borderBottom: "1px solid #ddd", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <div>
                <Link to="/" style={{ marginRight: "1rem" }}>Directory</Link>
                <Link to="/federation-graph">Federation Graph</Link>
            </div>
            <a href="https://github.com/foederierter-datenpool/directory-builder" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
    )
}

function Directory() {
    return (
        <main style={{ padding: "1rem" }}>
            TODO
        </main>
    )
}

function FederationGraphPage() {
    return (
        <main style={{ height: "calc(100vh - 33px)" }}>
            <FederationGraph />
        </main>
    )
}

export default function App() {
    return (
        <HashRouter>
            <Nav />
            <Routes>
                <Route path="/" element={<Directory />} />
                <Route path="/federation-graph" element={<FederationGraphPage />} />
            </Routes>
        </HashRouter>
    )
}

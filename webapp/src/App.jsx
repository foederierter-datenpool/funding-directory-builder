import { HashRouter, Routes, Route, Link } from "react-router-dom"
import MappingGraph from "./MappingGraph.jsx"
import React from "react"

function Nav() {
    return (
        <nav style={{ padding: "0.3rem 0.75rem", borderBottom: "1px solid #ddd", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <div>
                <Link to="/" style={{ marginRight: "1rem" }}>Directory</Link>
                <Link to="/mapping-graph">Mapping Graph</Link>
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

function MappingGraphPage() {
    return (
        <main style={{ height: "calc(100vh - 33px)" }}>
            <MappingGraph />
        </main>
    )
}

export default function App() {
    return (
        <HashRouter>
            <Nav />
            <Routes>
                <Route path="/" element={<Directory />} />
                <Route path="/mapping-graph" element={<MappingGraphPage />} />
            </Routes>
        </HashRouter>
    )
}

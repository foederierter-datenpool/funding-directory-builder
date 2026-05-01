import { HashRouter, Routes, Route, Link } from "react-router-dom"
import MappingGraph from "./MappingGraph.jsx"
import MatchGraph from "./MatchGraph.jsx"
import MergedDirectory from "./MergedDirectory.jsx"
import React from "react"

function Nav() {
    return (
        <nav style={{ padding: "0.3rem 0.75rem", borderBottom: "1px solid #ddd", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
            <div>
                <Link to="/" style={{ marginRight: "1rem" }}>Home</Link>
                <Link to="/mapping-graph" style={{ marginRight: "1rem" }}>Mapping Graph</Link>
                <Link to="/match-graph" style={{ marginRight: "1rem" }}>Match Graph</Link>
                <Link to="/merged-directory">Merged Directory</Link>
            </div>
            <a href="https://github.com/foederierter-datenpool/directory-builder" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
    )
}

function Home() {
    return <div style={{ padding: "1rem" }}>TODO</div>
}

export default function App() {
    return (
        <HashRouter>
            <Nav />
            <main style={{ height: "calc(100vh - 33px)" }}>
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/mapping-graph" element={<MappingGraph />} />
                    <Route path="/match-graph" element={<MatchGraph />} />
                    <Route path="/merged-directory" element={<MergedDirectory />} />
                </Routes>
            </main>
        </HashRouter>
    )
}

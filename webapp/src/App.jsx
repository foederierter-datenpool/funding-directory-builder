import { HashRouter, Routes, Route, Link } from "react-router-dom"
import About from "./About.jsx"
import MappingGraph from "./MappingGraph.jsx"
import MatchGraph from "./MatchGraph.jsx"
import MergedDirectory from "./MergedDirectory.jsx"
import React from "react"

function Nav() {
    return (
        <nav>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <Link to="/">About</Link>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", border: "1px solid #aaa", borderRadius: 4, padding: "0.3rem 0.6rem" }}>
                    <Link to="/mapping-graph">Map</Link>
                    <Link to="/match-graph">Match</Link>
                    <Link to="/merged-directory">Merge</Link>
                </div>
                <Link to="/directory">Directory</Link>
                <Link to="/apis">APIs</Link>
            </div>
            <a href="https://github.com/foederierter-datenpool/directory-builder" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
    )
}

function Directory() {
    return <div className="page">TODO</div>
}

function Apis() {
    return <div className="page">TODO</div>
}

export default function App() {
    return (
        <HashRouter>
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
                <Nav />
                <main>
                    <Routes>
                        <Route path="/" element={<About />} />
                        <Route path="/mapping-graph" element={<MappingGraph />} />
                        <Route path="/match-graph" element={<MatchGraph />} />
                        <Route path="/merged-directory" element={<MergedDirectory />} />
                        <Route path="/directory" element={<Directory />} />
                        <Route path="/apis" element={<Apis />} />
                    </Routes>
                </main>
            </div>
        </HashRouter>
    )
}

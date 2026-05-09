import { HashRouter, Routes, Route, NavLink } from "react-router-dom"
import About from "./About.jsx"
import Directory from "./Directory.jsx"
import Download from "./Download.jsx"
import Pipeline from "./Pipeline.jsx"
import MapGraph from "./MapGraph.jsx"
import MatchGraph from "./MatchGraph.jsx"
import MergeTables from "./MergeTables.jsx"
import Query from "./Query.jsx"
import Sources from "./Sources.jsx"
import React, { useState } from "react"

const STORAGE_KEY = "showFederation"

const initialShowFed = () => {
    try { return localStorage.getItem(STORAGE_KEY) === "true" } catch { return false }
}

function Nav() {
    const [showFed, setShowFed] = useState(initialShowFed)
    const update = (v) => {
        setShowFed(v)
        try { localStorage.setItem(STORAGE_KEY, String(v)) } catch {}
    }
    return (
        <nav>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <NavLink to="/" end>About</NavLink>
                {showFed && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", border: "1px solid #aaa", borderRadius: 4, padding: "0.3rem 0.6rem" }}>
                        <NavLink to="/sources">Sources</NavLink>
                        <NavLink to="/pipeline">Pipeline</NavLink>
                        <NavLink to="/map">Map</NavLink>
                        <NavLink to="/match">Match</NavLink>
                        <NavLink to="/merge">Merge</NavLink>
                    </div>
                )}
                <NavLink to="/directory">Directory</NavLink>
                <NavLink to="/query">Query</NavLink>
                <NavLink to="/download">Download</NavLink>
                <NavLink to="/apis">APIs</NavLink>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: 13, color: "#666" }}>
                    <input type="checkbox" checked={showFed} onChange={(e) => update(e.target.checked)} />
                    Show federation process
                </label>
                <a href="https://github.com/foederierter-datenpool/directory-builder" target="_blank" rel="noreferrer">GitHub</a>
            </div>
        </nav>
    )
}

function Apis() {
    return (
        <div className="page">
            <p><strong>TODO</strong>:</p>
            <ul>
                <li>OpenAPI / Swagger</li>
                <li>SPARQL endpoint</li>
            </ul>
        </div>
    )
}

export default function App() {
    return (
        <HashRouter>
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
                <Nav />
                <main>
                    <Routes>
                        <Route path="/" element={<About />} />
                        <Route path="/pipeline" element={<Pipeline />} />
                        <Route path="/sources" element={<Sources />} />
                        <Route path="/map" element={<MapGraph />} />
                        <Route path="/match" element={<MatchGraph />} />
                        <Route path="/merge" element={<MergeTables />} />
                        <Route path="/directory" element={<Directory />} />
                        <Route path="/query" element={<Query />} />
                        <Route path="/download" element={<Download />} />
                        <Route path="/apis" element={<Apis />} />
                    </Routes>
                </main>
            </div>
        </HashRouter>
    )
}

import { HashRouter, Routes, Route, NavLink } from "react-router-dom"
import About from "./About.jsx"
import MapGraph from "./MapGraph.jsx"
import MatchGraph from "./MatchGraph.jsx"
import MergeTables from "./MergeTables.jsx"
import Query from "./Query.jsx"
import React from "react"

function Nav() {
    return (
        <nav>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <NavLink to="/" end>About</NavLink>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", border: "1px solid #aaa", borderRadius: 4, padding: "0.3rem 0.6rem" }}>
                    <NavLink to="/map">Map</NavLink>
                    <NavLink to="/match">Match</NavLink>
                    <NavLink to="/merge">Merge</NavLink>
                </div>
                <NavLink to="/directory">Directory</NavLink>
                <NavLink to="/query">Query</NavLink>
                <NavLink to="/apis">APIs</NavLink>
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
                        <Route path="/map" element={<MapGraph />} />
                        <Route path="/match" element={<MatchGraph />} />
                        <Route path="/merge" element={<MergeTables />} />
                        <Route path="/directory" element={<Directory />} />
                        <Route path="/query" element={<Query />} />
                        <Route path="/apis" element={<Apis />} />
                    </Routes>
                </main>
            </div>
        </HashRouter>
    )
}

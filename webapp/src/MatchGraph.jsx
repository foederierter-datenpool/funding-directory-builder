import ttl from "../../data/out/matches.ttl?raw"
import { loadMatches } from "./loadMatches.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React from "react"

const COLUMNS = ["Source", "MatchCluster"]
const COLORS = { Source: "#d4e7ff", MatchCluster: "#f4cfe0" }
const CENTER_COLUMNS = ["MatchCluster"]

const { nodes, edges } = loadMatches(ttl)

export default function MatchGraph() {
    return <ColumnGraph nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} centerColumns={CENTER_COLUMNS} />
}

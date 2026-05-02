import ttl from "../../data/pipeline/matches.ttl?raw"
import { loadMatch } from "./loadMatch.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React from "react"

const COLUMNS = ["Source", "MatchCluster"]
const COLORS = { Source: "#d4e7ff", MatchCluster: "#f4cfe0" }
const CENTER_COLUMNS = ["MatchCluster"]

const { nodes, edges } = loadMatch(ttl)

export default function MatchGraph() {
    return <ColumnGraph nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} centerColumns={CENTER_COLUMNS} />
}

import ttl from "../../config/federation.ttl?raw"
import { loadMapping } from "./loadMapping.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React from "react"

const COLUMNS = ["Source", "SourceField", "TransformNode", "TargetField", "TargetSchema"]
const COLORS = {
    Source: "#d4e7ff",
    SourceField: "#e6f3d8",
    TransformNode: "#fff1a8",
    TargetField: "#fde2c7",
    TargetSchema: "#f4cfe0",
}

const { nodes, edges } = loadMapping(ttl)

export default function MappingGraph() {
    return <ColumnGraph nodes={nodes} edges={edges} columns={COLUMNS} colors={COLORS} />
}

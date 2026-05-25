// Pipeline view: the fetch→lift→…→resolve step graph from the pipeline config.
// Reads:  config/pipeline.ttl (via loadPipeline.js)
// Does:   renders the Pipeline page (vertical <ColumnGraph>)

import ttl from "../../config/pipeline.ttl?raw"
import { loadPipeline } from "./loadPipeline.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React from "react"

const COLUMNS = ["Fetch", "Lift", "Clean", "Load", "Map", "Match", "Merge", "Resolve"]
const CENTER_COLUMNS = ["Clean", "Load", "Map", "Match", "Merge", "Resolve"]
const COLORS = {
    Fetch:   "#d4e7ff",
    Lift:    "#e6f3d8",
    Clean:   "#fff1a8",
    Load:    "#fde2c7",
    Map:     "#f4cfe0",
    Match:   "#e2d4f4",
    Merge:   "#cfe9d8",
    Resolve: "#c5e0e8",
}

const { nodes, edges } = loadPipeline(ttl)

export default function Pipeline() {
    return (
        <ColumnGraph
            nodes={nodes}
            edges={edges}
            columns={COLUMNS}
            colors={COLORS}
            centerColumns={CENTER_COLUMNS}
            direction="vertical"
            colSpacing={170}
            siblingGap={280}
            nodeWidth={240}
        />
    )
}

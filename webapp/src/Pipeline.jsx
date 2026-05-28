// Pipeline view: the fetch→lift→…→resolve step graph from the pipeline config.
// Reads:  config/pipeline.ttl, config/federation.ttl (via loadPipeline.js)
// Does:   renders the Pipeline page (horizontal <ColumnGraph>) with a Source
//         lane-header per Fetch and payload labels on the edges

import pipelineTtl from "../../config/pipeline.ttl?raw"
import federationTtl from "../../config/federation.ttl?raw"
import { loadPipeline } from "./loadPipeline.js"
import ColumnGraph from "./ColumnGraph.jsx"
import React from "react"

const COLUMNS = ["Source", "Fetch", "Lift", "Clean", "Map", "Match", "Merge", "Resolve", "End"]
const CENTER_COLUMNS = ["Clean", "Map", "Match", "Merge", "Resolve", "End"]
const COLORS = {
    Fetch:   "#d4e7ff",
    Lift:    "#e6f3d8",
    Clean:   "#fff1a8",
    Map:     "#f4cfe0",
    Match:   "#e2d4f4",
    Merge:   "#cfe9d8",
    Resolve: "#c5e0e8",
}

const { nodes, edges } = loadPipeline(pipelineTtl, federationTtl)

export default function Pipeline() {
    return (
        <ColumnGraph
            nodes={nodes}
            edges={edges}
            columns={COLUMNS}
            colors={COLORS}
            centerColumns={CENTER_COLUMNS}
            direction="vertical"
            colSpacing={120}
            siblingGap={240}
            nodeWidth={150}
        />
    )
}

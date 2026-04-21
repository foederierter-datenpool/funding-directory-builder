import { ReactFlow, Background, Controls, MarkerType, Handle, Position } from "@xyflow/react"
import ttl from "../../definitions/federation.ttl?raw"
import { loadFederation } from "./loadFederation.js"
import React, { useMemo } from "react"
import "@xyflow/react/dist/style.css"

const COLUMNS = ["Source", "SourceField", "TargetField", "TargetSchema"]
const COLUMN_X = { Source: 0, SourceField: 260, TargetField: 540, TargetSchema: 820 }
const COLORS = {
    Source: "#d4e7ff",
    SourceField: "#e6f3d8",
    TargetField: "#fde2c7",
    TargetSchema: "#f4cfe0",
}

function SideNode({ data, style }) {
    return (
        <div style={{ ...style, textAlign: "center" }}>
            <Handle type="target" position={Position.Left} />
            {data.label}
            <Handle type="source" position={Position.Right} />
        </div>
    )
}

const nodeTypes = { sideNode: SideNode }

function toFlow({ nodes, edges }) {
    const buckets = Object.fromEntries(COLUMNS.map((c) => [c, []]))
    for (const n of nodes) (buckets[n.type] ??= []).push(n)

    const flowNodes = []
    for (const col of COLUMNS) {
        buckets[col].forEach((n, i) => {
            flowNodes.push({
                id: n.id,
                type: "sideNode",
                position: { x: COLUMN_X[col] ?? 0, y: i * 80 },
                data: { label: n.label },
                style: {
                    background: COLORS[col] ?? "#eee",
                    border: "1px solid #888",
                    borderRadius: 4,
                    fontSize: 12,
                    padding: 6,
                    width: 160,
                },
            })
        })
    }

    const flowEdges = edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.from,
        target: e.to,
        label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed },
    }))

    return { flowNodes, flowEdges }
}

export default function FederationGraph() {
    const { flowNodes, flowEdges } = useMemo(() => toFlow(loadFederation(ttl)), [])
    return (
        <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes} fitView>
            <Background />
            <Controls showInteractive={false} />
        </ReactFlow>
    )
}

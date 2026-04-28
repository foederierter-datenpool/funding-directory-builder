import { ReactFlow, Background, Controls, MarkerType, Handle, Position, useNodesState, useEdgesState } from "@xyflow/react"
import ttl from "../../config/federation.ttl?raw"
import { loadFederation } from "./loadFederation.js"
import React, { useMemo, useState } from "react"
import "@xyflow/react/dist/style.css"

const COLUMNS = ["Source", "SourceField", "TransformNode", "TargetField", "TargetSchema", "MergeRule"]
const COLUMN_X = { Source: 0, SourceField: 260, TransformNode: 520, TargetField: 780, TargetSchema: 1040, MergeRule: 1300 }
const ROW_HEIGHT = 80
const CENTER_COLUMNS = true
const COLORS = {
    Source: "#d4e7ff",
    SourceField: "#e6f3d8",
    TransformNode: "#fff1a8",
    TargetField: "#fde2c7",
    TargetSchema: "#f4cfe0",
    MergeRule: "#dcd0f5",
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

    const maxColSize = Math.max(...COLUMNS.map((c) => buckets[c]?.length ?? 0))
    const flowNodes = []
    for (const col of COLUMNS) {
        const colSize = buckets[col]?.length ?? 0
        const yOffset = CENTER_COLUMNS ? ((maxColSize - colSize) / 2) * ROW_HEIGHT : 0
        buckets[col].forEach((n, i) => {
            flowNodes.push({
                id: n.id,
                type: "sideNode",
                position: { x: COLUMN_X[col] ?? 0, y: yOffset + i * ROW_HEIGHT },
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
        // label: e.label,
        markerEnd: { type: MarkerType.ArrowClosed },
    }))

    return { flowNodes, flowEdges }
}

export default function FederationGraph() {
    const { flowNodes, flowEdges } = useMemo(() => toFlow(loadFederation(ttl)), [])
    const [nodes, , onNodesChange] = useNodesState(flowNodes)
    const [edges, , onEdgesChange] = useEdgesState(flowEdges)
    const [draggingId, setDraggingId] = useState(null)

    const styledEdges = useMemo(() => edges.map((e) => {
        const attached = e.source === draggingId || e.target === draggingId
        return attached
            ? { ...e, style: { stroke: "#ff6a00", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ff6a00" }, zIndex: 1000 }
            : e
    }), [edges, draggingId])

    return (
        <ReactFlow
            nodes={nodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={(_, n) => setDraggingId(n.id)}
            onNodeDragStop={() => setDraggingId(null)}
            nodeTypes={nodeTypes}
            fitView
        >
            <Background />
            <Controls showInteractive={false} />
        </ReactFlow>
    )
}

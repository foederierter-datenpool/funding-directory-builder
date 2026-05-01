import { ReactFlow, Background, Controls, MarkerType, Handle, Position, useNodesState, useEdgesState } from "@xyflow/react"
import React, { useMemo, useState } from "react"
import "@xyflow/react/dist/style.css"

const COLUMN_X_GAP = 260
const ROW_HEIGHT = 80

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

function toFlow({ nodes, edges }, columns, colors, centerColumns) {
    const centered = new Set(centerColumns ?? [])
    const buckets = Object.fromEntries(columns.map((c) => [c, []]))
    for (const n of nodes) (buckets[n.type] ??= []).push(n)

    const maxColSize = Math.max(...columns.map((c) => buckets[c]?.length ?? 0))
    const positions = new Map()

    columns.forEach((col, colIdx) => {
        const x = colIdx * COLUMN_X_GAP
        const colNodes = buckets[col] ?? []
        if (centered.has(col)) {
            // Position each node at the average y of its incoming neighbours,
            // sorted so we can push later nodes down to avoid overlap.
            const incomingYs = new Map()
            for (const e of edges) {
                const fromPos = positions.get(e.from)
                if (!fromPos) continue
                if (!incomingYs.has(e.to)) incomingYs.set(e.to, [])
                incomingYs.get(e.to).push(fromPos.y)
            }
            const ranked = colNodes.map((n) => {
                const ys = incomingYs.get(n.id) ?? []
                const target = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0
                return { node: n, target }
            }).sort((a, b) => a.target - b.target)
            let lastY = -Infinity
            for (const { node, target } of ranked) {
                const y = Math.max(target, lastY + ROW_HEIGHT)
                positions.set(node.id, { x, y })
                lastY = y
            }
        } else {
            const yOffset = ((maxColSize - colNodes.length) / 2) * ROW_HEIGHT
            colNodes.forEach((n, i) => {
                positions.set(n.id, { x, y: yOffset + i * ROW_HEIGHT })
            })
        }
    })

    const flowNodes = []
    for (const n of nodes) {
        const pos = positions.get(n.id)
        if (!pos) continue
        flowNodes.push({
            id: n.id,
            type: "sideNode",
            position: pos,
            data: { label: n.label },
            style: {
                background: colors[n.type] ?? "#eee",
                border: "1px solid #888",
                borderRadius: 4,
                fontSize: 12,
                padding: 6,
                width: 160,
            },
        })
    }

    const flowEdges = edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.from,
        target: e.to,
        markerEnd: { type: MarkerType.ArrowClosed },
    }))

    return { flowNodes, flowEdges }
}

export default function ColumnGraph({ nodes, edges, columns, colors, centerColumns }) {
    const { flowNodes, flowEdges } = useMemo(() => toFlow({ nodes, edges }, columns, colors, centerColumns), [nodes, edges, columns, colors, centerColumns])
    const [rfNodes, , onNodesChange] = useNodesState(flowNodes)
    const [rfEdges, , onEdgesChange] = useEdgesState(flowEdges)
    const [draggingId, setDraggingId] = useState(null)

    const styledEdges = useMemo(() => rfEdges.map((e) => {
        const attached = e.source === draggingId || e.target === draggingId
        return attached
            ? { ...e, style: { stroke: "#ff6a00", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ff6a00" }, zIndex: 1000 }
            : e
    }), [rfEdges, draggingId])

    return (
        <ReactFlow
            nodes={rfNodes}
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

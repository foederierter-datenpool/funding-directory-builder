import { ReactFlow, Background, Controls, MarkerType, Handle, Position, useNodesState, useEdgesState } from "@xyflow/react"
import React, { useMemo, useState } from "react"
import "@xyflow/react/dist/style.css"

const DEFAULT_COL_SPACING = 260
const DEFAULT_SIBLING_GAP = 80
const DEFAULT_NODE_WIDTH = 160

function SideNode({ data, style }) {
    const targetPos = data.targetPos ?? Position.Left
    const sourcePos = data.sourcePos ?? Position.Right
    return (
        <div style={style}>
            <Handle type="target" position={targetPos} />
            <div style={{ textAlign: "center", fontWeight: data.props?.length ? 600 : 400 }}>{data.label}</div>
            {data.props?.length > 0 && (
                <div style={{ marginTop: 6, fontSize: 9, lineHeight: "13px", color: "#888" }}>
                    {data.props.map((p, i) => (
                        <div key={i} style={{ display: "flex", gap: 4, whiteSpace: "nowrap", overflow: "hidden" }} title={`${p.key}: ${p.value}`}>
                            <span>{p.key}:</span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{p.value}</span>
                        </div>
                    ))}
                </div>
            )}
            <Handle type="source" position={sourcePos} />
        </div>
    )
}

const nodeTypes = { sideNode: SideNode }

function toFlow({ nodes, edges }, columns, colors, centerColumns, direction, colSpacing, siblingGap, nodeWidth) {
    const isVertical = direction === "vertical"
    const centered = new Set(centerColumns ?? [])
    const buckets = Object.fromEntries(columns.map((c) => [c, []]))
    for (const n of nodes) (buckets[n.type] ??= []).push(n)

    const maxColSize = Math.max(...columns.map((c) => buckets[c]?.length ?? 0))
    // Logical layout in (col-axis, sibling-axis) coords; swapped at the end for vertical mode.
    const positions = new Map()

    columns.forEach((col, colIdx) => {
        const x = colIdx * colSpacing
        const colNodes = buckets[col] ?? []
        if (centered.has(col)) {
            // Position each node at the average sibling-axis coord of its incoming neighbours,
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
                const y = Math.max(target, lastY + siblingGap)
                positions.set(node.id, { x, y })
                lastY = y
            }
        } else {
            const yOffset = ((maxColSize - colNodes.length) / 2) * siblingGap
            colNodes.forEach((n, i) => {
                positions.set(n.id, { x, y: yOffset + i * siblingGap })
            })
        }
    })

    const targetPos = isVertical ? Position.Top : Position.Left
    const sourcePos = isVertical ? Position.Bottom : Position.Right

    const flowNodes = []
    for (const n of nodes) {
        const pos = positions.get(n.id)
        if (!pos) continue
        flowNodes.push({
            id: n.id,
            type: "sideNode",
            position: isVertical ? { x: pos.y, y: pos.x } : pos,
            data: { label: n.label, props: n.props, targetPos, sourcePos },
            style: {
                background: colors[n.type] ?? "#eee",
                border: "1px solid #888",
                borderRadius: 4,
                fontSize: 12,
                padding: 6,
                width: nodeWidth,
            },
        })
    }

    const flowEdges = edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.from,
        target: e.to,
        ...(e.manual && { style: { stroke: "#3b82f6", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" } }),
        ...(!e.manual && { markerEnd: { type: MarkerType.ArrowClosed } }),
    }))

    return { flowNodes, flowEdges }
}

export default function ColumnGraph({ nodes, edges, columns, colors, centerColumns, direction = "horizontal", colSpacing = DEFAULT_COL_SPACING, siblingGap = DEFAULT_SIBLING_GAP, nodeWidth = DEFAULT_NODE_WIDTH }) {
    const { flowNodes, flowEdges } = useMemo(() => toFlow({ nodes, edges }, columns, colors, centerColumns, direction, colSpacing, siblingGap, nodeWidth), [nodes, edges, columns, colors, centerColumns, direction, colSpacing, siblingGap, nodeWidth])
    const [rfNodes, , onNodesChange] = useNodesState(flowNodes)
    const [rfEdges, , onEdgesChange] = useEdgesState(flowEdges)
    const [draggingId, setDraggingId] = useState(null)

    const styledEdges = useMemo(() => rfEdges.map((e) => {
        const attached = e.source === draggingId || e.target === draggingId
        return attached
            ? { ...e, style: { stroke: "#ff6a00", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ff6a00" }, zIndex: 1000 }
            : e
    }), [rfEdges, draggingId])

    const onInit = async (instance) => {
        await instance.fitView()
        const { x, zoom } = instance.getViewport()
        const minY = Math.min(...instance.getNodes().map((n) => n.position.y))
        instance.setViewport({ x, y: 20 - minY * zoom, zoom })
    }

    return (
        <ReactFlow
            nodes={rfNodes}
            edges={styledEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStart={(_, n) => setDraggingId(n.id)}
            onNodeDragStop={() => setDraggingId(null)}
            nodeTypes={nodeTypes}
            onInit={onInit}
        >
            <Background />
            <Controls showInteractive={false} />
        </ReactFlow>
    )
}

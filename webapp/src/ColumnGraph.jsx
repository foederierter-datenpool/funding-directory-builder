import { ReactFlow, Background, Controls, MarkerType, Handle, Position, useNodesState, useEdgesState, BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react"
import React, { createContext, useContext, useEffect, useMemo, useState } from "react"
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

// Shared state so hovering an edge or its label highlights the other.
const HoveredEdgeContext = createContext({ id: null, set: () => {} })

const HOVER_COLOR = "#ff6a00"

// Renders `data.value` near the bezier midpoint with a small per-edge offset
// (so parallel edges don't pile up). `data.bg` tints the label by the
// transformation "moment" — source-field outgoing vs. transform outgoing.
function ValueEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, markerEnd, style }) {
    const [edgePath, midX, midY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
    const idx = data.idx ?? 0
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    const len = Math.hypot(dx, dy) || 1
    const tShift = (((idx % 5) - 2) / 2) * 0.15
    const perp   = ((idx % 3) - 1) * 14
    const labelX = midX + dx * tShift + (-dy / len) * perp
    const labelY = midY + dy * tShift + ( dx / len) * perp

    const { id: hoveredId, set } = useContext(HoveredEdgeContext)
    const hovered = hoveredId === id
    // Edges attached to a node being dragged are highlighted by the parent
    // (orange stroke); we mirror that highlight on the label here.
    const highlight = hovered || data.attached
    const onIn = () => set(id)
    const onOut = () => set(null)

    const edgeStyle = hovered ? { ...style, stroke: HOVER_COLOR, strokeWidth: 2 } : style
    const edgeMarker = hovered ? { type: MarkerType.ArrowClosed, color: HOVER_COLOR } : markerEnd

    return (
        <>
            <g onPointerEnter={onIn} onPointerLeave={onOut} style={{ cursor: "grab" }}>
                <BaseEdge id={id} path={edgePath} markerEnd={edgeMarker} style={edgeStyle} />
            </g>
            <EdgeLabelRenderer>
                <div
                    title={data.value}
                    onPointerEnter={onIn}
                    onPointerLeave={onOut}
                    style={{
                        position: "absolute",
                        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        background: data.bg ?? "white",
                        border: `1px solid ${highlight ? HOVER_COLOR : "#bbb"}`,
                        borderRadius: 3,
                        padding: "2px 5px",
                        fontSize: 10,
                        lineHeight: "12px",
                        color: "#444",
                        pointerEvents: "auto",
                        cursor: "default",
                        maxWidth: 150,
                        wordBreak: "break-word",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        ...(highlight && { zIndex: 1000, boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }),
                    }}
                >{data.value}</div>
            </EdgeLabelRenderer>
        </>
    )
}

const nodeTypes = { sideNode: SideNode }
const edgeTypes = { value: ValueEdge }

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
        ...(e.value !== undefined && { type: "value", data: { value: e.value, idx: i, bg: e.valueBg } }),
        markerEnd: { type: MarkerType.ArrowClosed },
    }))

    return { flowNodes, flowEdges }
}

export default function ColumnGraph({ nodes, edges, columns, colors, centerColumns, direction = "horizontal", colSpacing = DEFAULT_COL_SPACING, siblingGap = DEFAULT_SIBLING_GAP, nodeWidth = DEFAULT_NODE_WIDTH }) {
    const { flowNodes, flowEdges } = useMemo(() => toFlow({ nodes, edges }, columns, colors, centerColumns, direction, colSpacing, siblingGap, nodeWidth), [nodes, edges, columns, colors, centerColumns, direction, colSpacing, siblingGap, nodeWidth])
    const [rfNodes, , onNodesChange] = useNodesState(flowNodes)
    const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(flowEdges)
    const [draggingId, setDraggingId] = useState(null)
    const [hoveredEdge, setHoveredEdge] = useState(null)
    const hoverCtx = useMemo(() => ({ id: hoveredEdge, set: setHoveredEdge }), [hoveredEdge])
    // Sync edges when value labels change (e.g. selecting a different org) so
    // the user keeps any node positions they've dragged.
    useEffect(() => { setRfEdges(flowEdges) }, [flowEdges, setRfEdges])

    const styledEdges = useMemo(() => rfEdges.map((e) => {
        const attached = e.source === draggingId || e.target === draggingId
        return attached
            ? { ...e, style: { stroke: "#ff6a00", strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ff6a00" }, zIndex: 1000, data: { ...e.data, attached: true } }
            : e
    }), [rfEdges, draggingId])

    const onInit = async (instance) => {
        await instance.fitView()
        const { x, zoom } = instance.getViewport()
        const minY = Math.min(...instance.getNodes().map((n) => n.position.y))
        instance.setViewport({ x, y: 20 - minY * zoom, zoom })
    }

    return (
        <HoveredEdgeContext.Provider value={hoverCtx}>
            {/* Differentiate cursors: pointer on draggable nodes, grab on
                edges (matching the canvas pan), so the open hand doesn't
                show indiscriminately on every hover. */}
            <style>{`.react-flow__node{cursor:pointer!important;}.react-flow__edge{cursor:grab!important;}`}</style>
            <ReactFlow
                nodes={rfNodes}
                edges={styledEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeDragStart={(_, n) => setDraggingId(n.id)}
                onNodeDragStop={() => setDraggingId(null)}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                onInit={onInit}
            >
                <Background />
                <Controls showInteractive={false} />
            </ReactFlow>
        </HoveredEdgeContext.Provider>
    )
}

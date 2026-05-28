// Helper for the Pipeline view: turn pipeline.ttl into a step graph.
// Reads:  the pipeline + federation TTL strings passed by Pipeline.jsx
// Does:   returns { nodes, edges } — Source lane-header nodes (transparent
//         fill, light-gray border) above each Fetch step, step nodes labelled
//         by their type (fetch/lift/clean/map/match/merge/resolve), and an
//         End sink so resolve's output is shown on a visible edge. Load is
//         filtered out and its edges are forwarded past it. Edge labels
//         describe the payload flowing between steps; multiple outputs
//         (e.g. merge's :provOutput) stack as newline-separated lines.

import { localName, parseTtl } from "../../utils.js"

const NS = "https://civic-data.de/pipeline#"
const PPLAN_IS_PRECEDED_BY = "http://purl.org/net/p-plan#isPrecededBy"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"
const FROM_SOURCE = `${NS}fromSource`
const FETCH_URL = `${NS}fetchUrl`
const STATIC_SOURCE = `${NS}staticSource`
const FORMAT = `${NS}format`
const OUTPUT = `${NS}output`
const PROV_OUTPUT = `${NS}provOutput`
const STEP_TYPES = ["Fetch", "Lift", "Clean", "Load", "Map", "Match", "Merge", "Resolve"]
const HIDDEN_STEPS = new Set(["Load"])
const LANE_BORDER = "#bbb"

const basename = (path) => path.replace(/^.*\//, "")

export function loadPipeline(pipelineTtl, federationTtl) {
    const quads = parseTtl(pipelineTtl)
    const fedQuads = federationTtl ? parseTtl(federationTtl) : []

    const stepType = new Map()
    const rawEdges = []
    const sourceOfStep = new Map()
    const formatOfStep = new Map()
    const outputOfStep = new Map()
    const provOutputOfStep = new Map()
    const hasFetchUrl = new Set()
    const hasStaticSource = new Set()
    for (const q of quads) {
        const p = q.predicate.value
        if (p === RDF_TYPE && q.object.value.startsWith(NS)) {
            const local = q.object.value.slice(NS.length)
            if (STEP_TYPES.includes(local)) stepType.set(q.subject.value, local)
        } else if (p === PPLAN_IS_PRECEDED_BY) rawEdges.push({ from: q.object.value, to: q.subject.value })
        else if (p === FROM_SOURCE)    sourceOfStep.set(q.subject.value, q.object.value)
        else if (p === FETCH_URL)      hasFetchUrl.add(q.subject.value)
        else if (p === STATIC_SOURCE)  hasStaticSource.add(q.subject.value)
        else if (p === FORMAT)         formatOfStep.set(q.subject.value, q.object.value)
        else if (p === OUTPUT)         outputOfStep.set(q.subject.value, q.object.value)
        else if (p === PROV_OUTPUT)    provOutputOfStep.set(q.subject.value, q.object.value)
    }

    // Forward edges past hidden (Load) steps so clean→load→map collapses to clean→map.
    const hidden = new Set([...stepType].filter(([, t]) => HIDDEN_STEPS.has(t)).map(([iri]) => iri))
    const incoming = new Map()
    for (const e of rawEdges) {
        if (!incoming.has(e.to)) incoming.set(e.to, [])
        incoming.get(e.to).push(e.from)
    }
    const resolvePreds = (iri) => (incoming.get(iri) ?? []).flatMap((p) => hidden.has(p) ? resolvePreds(p) : [p])

    const fileLabel = (fromIri) => {
        const outs = [outputOfStep.get(fromIri), provOutputOfStep.get(fromIri)].filter(Boolean).map(basename)
        return outs.length ? outs.join("\n") : null
    }
    const edgeLabel = (fromIri) => {
        const type = stepType.get(fromIri)
        if (type === "Fetch") return (formatOfStep.get(fromIri) ?? "").toUpperCase() || null
        if (type === "Lift" || type === "Clean") return "RDF"
        if (type === "Map" || type === "Match" || type === "Merge") return fileLabel(fromIri)
        return null
    }

    const stepEdges = []
    for (const iri of stepType.keys()) {
        if (hidden.has(iri)) continue
        for (const from of resolvePreds(iri)) {
            stepEdges.push({ from, to: iri, value: edgeLabel(from) ?? undefined, centered: true })
        }
    }

    const sourceLabel = new Map()
    for (const q of fedQuads) {
        if (q.predicate.value === RDFS_LABEL) sourceLabel.set(q.subject.value, q.object.value)
    }

    const stepNodes = [...stepType]
        .filter(([iri]) => !hidden.has(iri))
        .map(([iri, type]) => ({ id: iri, label: type.toLowerCase(), type }))

    const laneNodes = []
    const laneEdges = []
    for (const [iri, type] of stepType) {
        if (type !== "Fetch") continue
        const sourceIri = sourceOfStep.get(iri)
        if (!sourceIri) continue
        const laneId = `lane:${sourceIri}`
        laneNodes.push({
            id: laneId,
            label: sourceLabel.get(sourceIri) ?? localName(sourceIri),
            type: "Source",
            color: "transparent",
            borderColor: LANE_BORDER,
        })
        const value = hasFetchUrl.has(iri) ? "API" : hasStaticSource.has(iri) ? "Files" : undefined
        laneEdges.push({ from: laneId, to: iri, value, centered: true })
    }

    // End sink so resolve's output (final.ttl) is shown on a visible edge.
    const resolveIri = [...stepType].find(([, t]) => t === "Resolve")?.[0]
    const endNodes = []
    const endEdges = []
    if (resolveIri) {
        endNodes.push({ id: "end", label: "end", type: "End", color: "transparent", borderColor: LANE_BORDER })
        const out = outputOfStep.get(resolveIri)
        endEdges.push({ from: resolveIri, to: "end", value: out ? basename(out) : undefined, centered: true })
    }

    return {
        nodes: [...laneNodes, ...stepNodes, ...endNodes],
        edges: [...laneEdges, ...stepEdges, ...endEdges],
    }
}

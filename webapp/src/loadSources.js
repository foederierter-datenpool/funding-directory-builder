// Helper for the Sources view: aggregate per-:Source facts (label, field counts,
// record count, freshness) across config + pipeline data.
// Reads:  federation, pipeline, mapped, ingest-log TTL strings passed by Sources.jsx
// Does:   returns source[] ({iri, label, format, totalFields, mappedFields, records, …})

import { parseTtl, subjectsOfType } from "../../utils.js"

const NS = "https://civic-data.de/pipeline#"
const PROV_AT_TIME = "http://www.w3.org/ns/prov#atTime"
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"

const setAdd = (map, key, val) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(val)
}

export function loadSources(federationTtl, pipelineTtl, mappedTtl, ingestLogTtl) {
    const fedQuads = parseTtl(federationTtl)
    const pipeQuads = parseTtl(pipelineTtl)
    const mappedQuads = mappedTtl ? parseTtl(mappedTtl) : []
    const logQuads = ingestLogTtl ? parseTtl(ingestLogTtl) : []

    const sourceIris = subjectsOfType(fedQuads, `${NS}Source`)

    const props = new Map()
    const get = (iri) => {
        if (!props.has(iri)) props.set(iri, { iri })
        return props.get(iri)
    }

    // Source-level: label, top-level fields, sub-fields, mappings.
    const topFieldsOf = new Map()    // sourceIri -> Set<fieldIri>
    const subFieldsOf = new Map()    // fieldIri  -> Set<subFieldIri>
    const mappingSource = new Map()  // mappingIri -> sourceIri
    const fmsOfMapping = new Map()   // mappingIri -> Set<fieldMappingBnode>
    const fromsOfFm = new Map()      // bnode      -> Set<fieldIri>

    for (const q of fedQuads) {
        const p = q.predicate.value
        if (p === RDFS_LABEL && sourceIris.has(q.subject.value))   get(q.subject.value).label = q.object.value
        else if (p === `${NS}hasField`)        setAdd(topFieldsOf, q.subject.value, q.object.value)
        else if (p === `${NS}hasSubField`)     setAdd(subFieldsOf, q.subject.value, q.object.value)
        else if (p === `${NS}fromSource`)      mappingSource.set(q.subject.value, q.object.value)
        else if (p === `${NS}hasFieldMapping`) setAdd(fmsOfMapping, q.subject.value, q.object.value)
        else if (p === `${NS}from`)            setAdd(fromsOfFm, q.subject.value, q.object.value)
    }

    for (const sourceIri of sourceIris) {
        const top = topFieldsOf.get(sourceIri) ?? new Set()
        const all = new Set(top)
        for (const tf of top) for (const sf of subFieldsOf.get(tf) ?? []) all.add(sf)
        get(sourceIri).totalFields = all.size

        const mapped = new Set()
        for (const [mappingIri, srcIri] of mappingSource) {
            if (srcIri !== sourceIri) continue
            for (const fm of fmsOfMapping.get(mappingIri) ?? []) {
                for (const f of fromsOfFm.get(fm) ?? []) mapped.add(f)
            }
        }
        get(sourceIri).mappedFields = mapped.size
    }

    // Pipeline-level: fetchUrl / staticSource + format via :fromSource on Fetch step.
    const fetchUrlByStep = new Map()
    const staticSourceByStep = new Map()
    const formatByStep = new Map()
    const stepToSource = new Map()
    for (const q of pipeQuads) {
        const p = q.predicate.value
        if (p === `${NS}fetchUrl`)          fetchUrlByStep.set(q.subject.value, q.object.value)
        else if (p === `${NS}staticSource`) staticSourceByStep.set(q.subject.value, q.object.value)
        else if (p === `${NS}format`)       formatByStep.set(q.subject.value, q.object.value)
        else if (p === `${NS}fromSource`)   stepToSource.set(q.subject.value, q.object.value)
    }
    for (const [step, sourceIri] of stepToSource) {
        if (!sourceIris.has(sourceIri)) continue
        const s = get(sourceIri)
        if (fetchUrlByStep.has(step))     s.fetchUrl     = fetchUrlByStep.get(step)
        if (staticSourceByStep.has(step)) s.staticSource = staticSourceByStep.get(step)
        if (formatByStep.has(step))       s.format       = formatByStep.get(step)
    }

    // Records: count distinct orgs in mapped.ttl per source via cdp:fromSource.
    const FROM_SOURCE = `${NS}fromSource`
    const subjectsBySource = new Map()
    for (const q of mappedQuads) {
        if (q.predicate.value === FROM_SOURCE) setAdd(subjectsBySource, q.object.value, q.subject.value)
    }
    for (const sourceIri of sourceIris) {
        get(sourceIri).records = subjectsBySource.get(sourceIri)?.size ?? 0
    }

    // Latest harvest timestamp per source from ingest-log.ttl. Each :harvested
    // bnode carries (:ofSource ?source, prov:atTime ?time); find the max time.
    const harvestBnode = new Map()
    for (const q of logQuads) {
        if (q.predicate.value === `${NS}ofSource`) {
            if (!harvestBnode.has(q.subject.value)) harvestBnode.set(q.subject.value, {})
            harvestBnode.get(q.subject.value).source = q.object.value
        } else if (q.predicate.value === PROV_AT_TIME) {
            if (!harvestBnode.has(q.subject.value)) harvestBnode.set(q.subject.value, {})
            harvestBnode.get(q.subject.value).time = q.object.value
        }
    }
    for (const { source, time } of harvestBnode.values()) {
        if (!source || !time || !sourceIris.has(source)) continue
        const cur = get(source).lastHarvestedAt
        if (!cur || time > cur) get(source).lastHarvestedAt = time
    }

    return [...sourceIris].map((iri) => get(iri))
}

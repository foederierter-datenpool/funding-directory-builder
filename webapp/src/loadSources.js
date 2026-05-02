import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"

const setAdd = (map, key, val) => {
    if (!map.has(key)) map.set(key, new Set())
    map.get(key).add(val)
}

export function loadSources(federationTtl, pipelineTtl, mappedTtl) {
    const fedQuads = new Parser().parse(federationTtl)
    const pipeQuads = new Parser().parse(pipelineTtl)
    const mappedQuads = mappedTtl ? new Parser().parse(mappedTtl) : []

    const sourceIris = new Set()
    for (const q of fedQuads) {
        if (q.predicate.value === RDF_TYPE && q.object.value === `${NS}Source`) sourceIris.add(q.subject.value)
    }

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
    const subjectPrefixOf = new Map() // mappingIri -> prefix

    for (const q of fedQuads) {
        const p = q.predicate.value
        if (p === RDFS_LABEL && sourceIris.has(q.subject.value))   get(q.subject.value).label = q.object.value
        else if (p === `${NS}hasField`)        setAdd(topFieldsOf, q.subject.value, q.object.value)
        else if (p === `${NS}hasSubField`)     setAdd(subFieldsOf, q.subject.value, q.object.value)
        else if (p === `${NS}fromSource`)      mappingSource.set(q.subject.value, q.object.value)
        else if (p === `${NS}hasFieldMapping`) setAdd(fmsOfMapping, q.subject.value, q.object.value)
        else if (p === `${NS}from`)            setAdd(fromsOfFm, q.subject.value, q.object.value)
        else if (p === `${NS}subjectPrefix`)   subjectPrefixOf.set(q.subject.value, q.object.value)
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

    // Pipeline-level: fetchUrl + format via :fromSource on Fetch step.
    const fetchUrlByStep = new Map()
    const formatByStep = new Map()
    const stepToSource = new Map()
    for (const q of pipeQuads) {
        const p = q.predicate.value
        if (p === `${NS}fetchUrl`)        fetchUrlByStep.set(q.subject.value, q.object.value)
        else if (p === `${NS}format`)     formatByStep.set(q.subject.value, q.object.value)
        else if (p === `${NS}fromSource`) stepToSource.set(q.subject.value, q.object.value)
    }
    for (const [step, sourceIri] of stepToSource) {
        if (!sourceIris.has(sourceIri)) continue
        const s = get(sourceIri)
        if (fetchUrlByStep.has(step)) s.fetchUrl = fetchUrlByStep.get(step)
        if (formatByStep.has(step))   s.format   = formatByStep.get(step)
    }

    // Records: count distinct subjects in mapped.ttl per source via :subjectPrefix.
    const prefixToSource = new Map()
    for (const [mappingIri, prefix] of subjectPrefixOf) {
        const sourceIri = mappingSource.get(mappingIri)
        if (sourceIri) prefixToSource.set(prefix, sourceIri)
    }
    const subjectsBySource = new Map()
    const seen = new Set()
    for (const q of mappedQuads) {
        const subj = q.subject.value
        if (seen.has(subj)) continue
        seen.add(subj)
        const local = subj.split(/[#/]/).pop()
        for (const [prefix, sourceIri] of prefixToSource) {
            if (local.startsWith(prefix)) { setAdd(subjectsBySource, sourceIri, subj); break }
        }
    }
    for (const sourceIri of sourceIris) {
        get(sourceIri).records = subjectsBySource.get(sourceIri)?.size ?? 0
    }

    return [...sourceIris].map((iri) => get(iri))
}

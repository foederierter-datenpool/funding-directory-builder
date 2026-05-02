import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"

export function loadSources(federationTtl, pipelineTtl) {
    const fedQuads = new Parser().parse(federationTtl)
    const pipeQuads = new Parser().parse(pipelineTtl)

    const sourceIris = new Set()
    for (const q of fedQuads) {
        if (q.predicate.value === RDF_TYPE && q.object.value === `${NS}Source`) {
            sourceIris.add(q.subject.value)
        }
    }

    const props = new Map()
    const get = (iri) => {
        if (!props.has(iri)) props.set(iri, { iri })
        return props.get(iri)
    }
    for (const q of fedQuads) {
        if (!sourceIris.has(q.subject.value)) continue
        const s = get(q.subject.value)
        if (q.predicate.value === RDFS_LABEL) s.label = q.object.value
    }

    // Walk Fetch steps to attach :fetchUrl and :format to the source they reference.
    const fetchUrlByStep = new Map()
    const formatByStep = new Map()
    const sourceByStep = new Map()
    for (const q of pipeQuads) {
        if (q.predicate.value === `${NS}fetchUrl`)        fetchUrlByStep.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}format`)     formatByStep.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}fromSource`) sourceByStep.set(q.subject.value, q.object.value)
    }
    for (const [step, sourceIri] of sourceByStep) {
        if (!sourceIris.has(sourceIri)) continue
        const s = get(sourceIri)
        if (fetchUrlByStep.has(step)) s.fetchUrl = fetchUrlByStep.get(step)
        if (formatByStep.has(step))   s.format   = formatByStep.get(step)
    }

    return [...sourceIris].map((iri) => get(iri))
}

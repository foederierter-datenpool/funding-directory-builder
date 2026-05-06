import { Parser } from "n3"

const NS = "https://civic-data.de/pipeline#"
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label"
const NODE_TYPES = [`${NS}Source`, `${NS}SourceField`, `${NS}TargetField`, `${NS}TargetSchema`, `${NS}TransformNode`]
const SUB_FIELD = `${NS}SubField`
const TRANSFORM = `${NS}TransformNode`

// Prefix map used to render target-predicate IRIs like `schema:identifier`
// instead of their local TargetField name (`t-identifier`).
const PREFIXES = {
    "http://schema.org/":          "schema",
    "http://purl.org/dc/terms/":   "dct",
    "http://xmlns.com/foaf/0.1/":  "foaf",
}

const localName = (iri) => iri.replace(/^.*[#/]/, "")
const prefixedIri = (iri) => {
    for (const [ns, p] of Object.entries(PREFIXES)) {
        if (iri.startsWith(ns)) return `${p}:${iri.slice(ns.length)}`
    }
    return iri
}

export function loadOrgsBySource(federationTtl, mappedTtl) {
    const fedQuads = new Parser().parse(federationTtl)
    const fromSource = new Map()
    const subjectPrefix = new Map()
    for (const q of fedQuads) {
        if (q.predicate.value === `${NS}fromSource`) fromSource.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}subjectPrefix`) subjectPrefix.set(q.subject.value, q.object.value)
    }
    const prefixToSource = new Map()
    for (const [mapping, src] of fromSource) {
        const p = subjectPrefix.get(mapping)
        if (p) prefixToSource.set(p, src)
    }

    const SCHEMA_NAME = "http://schema.org/name"
    const SCHEMA_IDENTIFIER = "http://schema.org/identifier"
    const mappedQuads = new Parser().parse(mappedTtl)
    const ids = new Map()
    const names = new Map()
    const subjects = new Set()
    for (const q of mappedQuads) {
        subjects.add(q.subject.value)
        if (q.predicate.value === SCHEMA_IDENTIFIER) ids.set(q.subject.value, q.object.value)
        else if (q.predicate.value === SCHEMA_NAME) names.set(q.subject.value, q.object.value)
    }

    const result = new Map()
    for (const iri of subjects) {
        const local = iri.replace(/^.*[#/]/, "")
        for (const [prefix, src] of prefixToSource) {
            if (local.startsWith(prefix)) {
                if (!result.has(src)) result.set(src, [])
                result.get(src).push({
                    iri,
                    id: ids.get(iri) ?? local.slice(prefix.length),
                    name: names.get(iri) ?? "",
                })
                break
            }
        }
    }
    for (const list of result.values()) list.sort((a, b) => a.id.localeCompare(b.id))
    return result
}

// For each org in mapped.ttl, resolve the literal value of each of its
// source fields/sub-fields (from the source's lifted/cleaned TTL) AND each
// target field (from mapped.ttl, indirected via the field's :targetPredicate).
// Returns Map<orgIri, Map<fieldIri, string>>.
export function loadFieldValuesByOrg(federationTtl, mappedTtl, liftedBySource) {
    const fedQuads = new Parser().parse(federationTtl)

    const mapping = new Map()
    const ensureMapping = (iri) => {
        if (!mapping.has(iri)) mapping.set(iri, {})
        return mapping.get(iri)
    }
    const fieldPathOf = new Map()
    const fieldsBySource = new Map()
    const subFieldsOf = new Map()
    const targetPredicateOf = new Map() // targetField IRI -> predicate IRI (e.g. schema:streetAddress)
    for (const q of fedQuads) {
        const p = q.predicate.value
        if (p === `${NS}fromSource`)         ensureMapping(q.subject.value).source = q.object.value
        else if (p === `${NS}subjectPrefix`) ensureMapping(q.subject.value).prefix = q.object.value
        else if (p === `${NS}subjectFrom`)   ensureMapping(q.subject.value).subjectFrom = q.object.value
        else if (p === `${NS}fieldPath`)     fieldPathOf.set(q.subject.value, q.object.value)
        else if (p === `${NS}targetPredicate`) targetPredicateOf.set(q.subject.value, q.object.value)
        else if (p === `${NS}hasField`) {
            if (!fieldsBySource.has(q.subject.value)) fieldsBySource.set(q.subject.value, [])
            fieldsBySource.get(q.subject.value).push(q.object.value)
        } else if (p === `${NS}hasSubField`) {
            if (!subFieldsOf.has(q.subject.value)) subFieldsOf.set(q.subject.value, [])
            subFieldsOf.get(q.subject.value).push(q.object.value)
        }
    }
    const mappingBySource = new Map()
    for (const m of mapping.values()) if (m.source) mappingBySource.set(m.source, m)

    const SCHEMA_IDENTIFIER = "http://schema.org/identifier"
    const mappedQuads = new Parser().parse(mappedTtl)
    const idOf = new Map()
    const orgs = new Set()
    const literalsByOrg = new Map() // orgIri -> Map<predicateIri, string>
    for (const q of mappedQuads) {
        orgs.add(q.subject.value)
        if (q.predicate.value === SCHEMA_IDENTIFIER) idOf.set(q.subject.value, q.object.value)
        if (q.object.termType === "Literal") {
            if (!literalsByOrg.has(q.subject.value)) literalsByOrg.set(q.subject.value, new Map())
            literalsByOrg.get(q.subject.value).set(q.predicate.value, q.object.value)
        }
    }
    const orgSource = new Map()
    for (const orgIri of orgs) {
        const local = localName(orgIri)
        for (const m of mapping.values()) {
            if (m.prefix && m.source && local.startsWith(m.prefix)) { orgSource.set(orgIri, m.source); break }
        }
    }

    const result = new Map()
    for (const [sourceIri, liftedTtl] of liftedBySource) {
        const m = mappingBySource.get(sourceIri)
        if (!m) continue

        // subject -> Map<predicate-localname, [{value, isLiteral}]>
        const graph = new Map()
        for (const q of new Parser().parse(liftedTtl)) {
            const sub = q.subject.value
            const predLocal = localName(q.predicate.value)
            if (!graph.has(sub)) graph.set(sub, new Map())
            const preds = graph.get(sub)
            if (!preds.has(predLocal)) preds.set(predLocal, [])
            preds.get(predLocal).push({ value: q.object.value, isLiteral: q.object.termType === "Literal" })
        }

        const subjectFromFP = m.subjectFrom ? fieldPathOf.get(m.subjectFrom) : null
        const fields = fieldsBySource.get(sourceIri) ?? []

        for (const [orgIri, src] of orgSource) {
            if (src !== sourceIri) continue
            const id = idOf.get(orgIri) ?? localName(orgIri).slice(m.prefix.length)

            // Prefer a match on the mapping's :subjectFrom field path (literal
            // equality); fall back to IRI suffix match for sources whose lifted
            // TTL has named subjects (e.g. dhs-clean.ttl: dhs:entry-<id>).
            let dataSubject = null
            if (subjectFromFP) {
                for (const [s, preds] of graph) {
                    if (preds.get(subjectFromFP)?.some(v => v.value === id)) { dataSubject = s; break }
                }
            } else {
                for (const s of graph.keys()) {
                    if (s.endsWith(`-${id}`) || s.endsWith(`/${id}`) || s.endsWith(`#${id}`)) { dataSubject = s; break }
                }
            }
            if (!dataSubject) continue

            const valueMap = new Map()
            const subjectPreds = graph.get(dataSubject) ?? new Map()
            for (const fieldIri of fields) {
                const fp = fieldPathOf.get(fieldIri)
                if (!fp) continue
                const vs = subjectPreds.get(fp)
                if (!vs?.length) continue
                const v = vs[0]
                if (v.isLiteral && v.value) valueMap.set(fieldIri, v.value)
                // Sub-fields hang off the parent field's blank-node value.
                if (subFieldsOf.has(fieldIri) && !v.isLiteral) {
                    const childPreds = graph.get(v.value)
                    if (childPreds) {
                        for (const subIri of subFieldsOf.get(fieldIri)) {
                            const subFp = fieldPathOf.get(subIri)
                            if (!subFp) continue
                            const subVs = childPreds.get(subFp)
                            if (subVs?.length && subVs[0].isLiteral && subVs[0].value) valueMap.set(subIri, subVs[0].value)
                        }
                    }
                }
            }
            result.set(orgIri, valueMap)
        }
    }

    // Layer in target-field values: indirect each :targetPredicate through the
    // org's literal predicate->value map from mapped.ttl. These are the values
    // that flow OUT of transform nodes (and equal the source value for direct
    // 1:1 mappings).
    for (const orgIri of orgs) {
        const preds = literalsByOrg.get(orgIri)
        if (!preds) continue
        if (!result.has(orgIri)) result.set(orgIri, new Map())
        const valueMap = result.get(orgIri)
        for (const [tfIri, predIri] of targetPredicateOf) {
            const v = preds.get(predIri)
            if (v) valueMap.set(tfIri, v)
        }
    }
    return result
}

export function loadSources(ttl) {
    const quads = new Parser().parse(ttl)
    const order = []
    const isSource = new Set()
    const labelOf = new Map()
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE && q.object.value === `${NS}Source`) {
            if (!isSource.has(q.subject.value)) { isSource.add(q.subject.value); order.push(q.subject.value) }
        } else if (q.predicate.value === RDFS_LABEL) {
            labelOf.set(q.subject.value, q.object.value)
        }
    }
    return order.map((iri) => ({ iri, label: labelOf.get(iri) ?? localName(iri) }))
}

export function loadMap(ttl, { hideUnmappedFields = true, hiddenSources } = {}) {
    const quads = new Parser().parse(ttl)

    const typeOf = new Map()
    for (const q of quads) {
        if (q.predicate.value === RDF_TYPE) {
            if (!typeOf.has(q.subject.value)) typeOf.set(q.subject.value, [])
            typeOf.get(q.subject.value).push(q.object.value)
        }
    }

    const nodeSet = new Set()
    for (const [iri, types] of typeOf) {
        if (types.some((t) => NODE_TYPES.includes(t) || t === SUB_FIELD)) nodeSet.add(iri)
    }

    const edges = []
    const push = (from, to, label) => {
        if (nodeSet.has(from) && nodeSet.has(to)) edges.push({ from, to, label })
    }

    // :from and :to on a field-mapping blank node can each carry multiple
    // values (comma-list in turtle), so track them as arrays. :via is
    // single-valued — it routes the mapping through a transform node.
    const bnodeFrom = new Map()
    const bnodeTo   = new Map()
    const bnodeVia  = new Map()
    const appendTo = (map, key, val) => {
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(val)
    }
    const targetPredicate = new Map()
    const fieldPath = new Map()
    for (const q of quads) {
        if (q.predicate.value === `${NS}hasField`)         push(q.subject.value, q.object.value, "hasField")
        else if (q.predicate.value === `${NS}hasSubField`) push(q.subject.value, q.object.value, "hasSubField")
        else if (q.predicate.value === `${NS}hasTargetField`) push(q.object.value, q.subject.value, "isTargetFieldOf")
        else if (q.predicate.value === `${NS}from`) appendTo(bnodeFrom, q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}to`)   appendTo(bnodeTo,   q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}via`)  bnodeVia.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}targetPredicate`) targetPredicate.set(q.subject.value, q.object.value)
        else if (q.predicate.value === `${NS}fieldPath`) fieldPath.set(q.subject.value, q.object.value)
    }
    // Deduplicate routed edges: the same (source, via) or (via, target) pair
    // can appear across multiple field-mappings sharing one transform node.
    const seen = new Set()
    const pushOnce = (f, t, label) => {
        const k = `${f}|${label}|${t}`
        if (seen.has(k)) return
        seen.add(k)
        push(f, t, label)
    }
    for (const q of quads) {
        if (q.predicate.value === `${NS}hasFieldMapping`) {
            const froms = bnodeFrom.get(q.object.value) ?? []
            const tos   = bnodeTo.get(q.object.value)   ?? []
            const via   = bnodeVia.get(q.object.value)
            if (via) {
                for (const f of froms) pushOnce(f, via, "mapsTo")
                for (const t of tos)   pushOnce(via, t, "mapsTo")
            } else {
                for (const f of froms) for (const t of tos) pushOnce(f, t, "mapsTo")
            }
        }
    }

    // SubFields render in the SourceField column — they're just nested fields.
    const typeFor = (iri) => {
        const ts = typeOf.get(iri) ?? []
        if (ts.includes(SUB_FIELD)) return "SourceField"
        for (const t of NODE_TYPES) if (ts.includes(t)) return localName(t)
        return "Node"
    }

    // Keep only nodes forward-reachable from a visible source. Fixed-point
    // pass over `edges` until no new node is added.
    if (hiddenSources?.size) {
        const reachable = new Set([...nodeSet].filter((iri) =>
            (typeOf.get(iri) ?? []).includes(`${NS}Source`) && !hiddenSources.has(iri)))
        for (let grew = true; grew;) {
            grew = false
            for (const e of edges) if (reachable.has(e.from) && !reachable.has(e.to)) { reachable.add(e.to); grew = true }
        }
        for (const iri of [...nodeSet]) if (!reachable.has(iri)) nodeSet.delete(iri)
    }

    // Optionally drop SourceField/SubField nodes that don't end up mapped to
    // any target field. A parent field is considered mapped if any of its
    // sub-fields is.
    let visibleEdges = edges
    if (hideUnmappedFields) {
        const mapped = new Set()
        for (const e of edges) if (e.label === "mapsTo") mapped.add(e.from)
        for (const e of edges) if (e.label === "hasSubField" && mapped.has(e.to)) mapped.add(e.from)

        for (const iri of [...nodeSet]) {
            const ts = typeOf.get(iri) ?? []
            const isField = ts.includes(`${NS}SourceField`) || ts.includes(SUB_FIELD)
            if (isField && !mapped.has(iri)) nodeSet.delete(iri)
        }
        visibleEdges = edges.filter((e) => nodeSet.has(e.from) && nodeSet.has(e.to))
    }

    const labelFor = (iri) => {
        const tp = targetPredicate.get(iri)
        if (tp) return prefixedIri(tp)
        const fp = fieldPath.get(iri)
        if (fp) return fp
        return localName(iri)
    }

    const nodes = [...nodeSet].map((iri) => ({ id: iri, label: labelFor(iri), type: typeFor(iri) }))
    return { nodes, edges: visibleEdges }
}

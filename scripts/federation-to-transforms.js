import { sparqlSelect, storeFromTurtles } from "@foerderfunke/sem-ops-utils"
import { DataFactory } from "rdf-data-factory"
import sparqljs from "sparqljs"
import path from "path"
import fs from "fs"

const FEDERATION_TTL = path.join(import.meta.dirname, "..", "definitions", "federation.ttl")
const store = storeFromTurtles([fs.readFileSync(FEDERATION_TTL, { encoding: "utf8" })])

const sourceName = process.argv[2] ?? "caritas"

const df = new DataFactory()
const generator = new sparqljs.Generator()

const makeVariable  = (name) => df.variable(name)
const makeNamedNode = (iri)  => df.namedNode(iri)
const makeLiteral   = (val)  => df.literal(val)
const makeTriple    = (subject, predicate, object) => ({ subject, predicate, object })
const makeOperation = (operator, ...args) => ({ type: "operation", operator, args })

// ---- Pull facts from federation.ttl -------------------------------------
const [info] = await sparqlSelect(`
    PREFIX : <https://civic-data.de/pipeline#>
    SELECT ?source ?location ?template ?subjectFromPath WHERE {
        ?source a :Source ;
            :location ?location .
        FILTER(CONTAINS(STR(?source), "${sourceName}"))
        ?mapping :fromSource ?source ;
            :subjectTemplate ?template ;
            :subjectFrom ?subjectFromField .
        ?subjectFromField :fieldPath ?subjectFromPath .
    }`, [store])

const mappings = await sparqlSelect(`
    PREFIX : <https://civic-data.de/pipeline#>
    SELECT ?fieldPath ?predicate WHERE {
        ?mapping :fromSource <${info.source}> ;
            :hasFieldMapping [ :from ?src ; :to ?tgt ] .
        ?src :fieldPath ?fieldPath .
        ?tgt :targetPredicate ?predicate .
    }`, [store])

// ---- Build the subject IRI expression -----------------------------------
const [templatePrefix, templateSuffix] = info.template.split(`{${info.subjectFromPath}}`)
const concatArgs = [makeLiteral(templatePrefix), makeVariable(info.subjectFromPath)]
if (templateSuffix) concatArgs.push(makeLiteral(templateSuffix))
const subjectIriExpression = makeOperation("iri", makeOperation("concat", ...concatArgs))

// ---- Build the sparqljs AST ---------------------------------------------
const subjectVar = makeVariable("iri")
const entryVar = makeVariable("entry")
const XYZ_NAMESPACE = "http://sparql.xyz/facade-x/data/"

const query = {
    type: "query",
    queryType: "CONSTRUCT",
    prefixes: {
        xyz: XYZ_NAMESPACE,
        schema: "http://schema.org/",
    },
    template: mappings.map(({ predicate, fieldPath }) =>
        makeTriple(subjectVar, makeNamedNode(predicate), makeVariable(fieldPath))),
    where: [{
        type: "service",
        name: makeNamedNode(`x-sparql-anything:location=${info.location}`),
        silent: false,
        patterns: [
            {
                type: "bgp",
                triples: mappings.map(({ fieldPath }) =>
                    makeTriple(entryVar, makeNamedNode(XYZ_NAMESPACE + fieldPath), makeVariable(fieldPath))),
            },
            { type: "bind", variable: subjectVar, expression: subjectIriExpression },
        ],
    }],
}

console.log(generator.stringify(query))

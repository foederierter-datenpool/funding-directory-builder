// The match rule, exercised through the real federate engine on hand-picked pairs.
//
// Cross-source overlap only exists in the full corpora: 50 of fdbBund's 2531 rows and
// 50 of Förderfinder's 218 are disjoint slices, so the development sample contains
// none of it and the rule cannot be observed to fire at all. These fixtures carry the
// pairs that matter instead — including the hard negatives, which a size-limited
// sample would be unlikely to contain both halves of.
//
// Both directions are asserted. A rule that merges nothing passes a
// positives-only suite, and so does a rule that merges everything.

import { test } from "node:test"
import assert from "node:assert/strict"
import path from "path"
import { federateFixtures } from "./helpers/federate.js"

const FIXTURES = {
    fdbBund: path.join(import.meta.dirname, "fixtures/match/fdbBund.json"),
    foerderfinder: path.join(import.meta.dirname, "fixtures/match/foerderfinder.json"),
}

// One federate run for every assertion below.
const result = await federateFixtures(FIXTURES)

// Cluster IRI → the source short-codes it absorbed. Members are minted by each
// extract as cdp:<notation>-<id>, so the prefix names the source.
const membersOf = new Map()
for (const block of result.matches.split(/\n(?=cdf:funding-)/)) {
    const iri = block.match(/^(cdf:funding-\w+)/)?.[1]
    if (!iri) continue
    membersOf.set(iri, new Set([...block.matchAll(/cdp:(fdb|dsee|eu|ff)-/g)].map((m) => m[1])))
}

// Resolved records, keyed by the name that survived resolve.
const records = new Map()
for (const block of result.directory.split(/\n(?=cdf:funding-)/)) {
    const iri = block.match(/^(cdf:funding-\w+)/)?.[1]
    const name = block.match(/schema:name "((?:[^"\\]|\\.)*)"/)?.[1]
    if (iri && name) records.set(name, { iri, sources: membersOf.get(iri) ?? new Set() })
}

const merged = (name) => {
    const r = records.get(name)
    assert.ok(r, `no resolved record named "${name}" — got: ${[...records.keys()].join(" | ")}`)
    return r
}

test("identical titles in the same Land merge across sources", () => {
    // The plain case: fdbBund and Förderfinder list the same Bavarian programme
    // under the same title. Before matching had criteria these were two records.
    for (const name of ["Förderung der Erziehungsberatungsstellen",
                        "Förderung des ehrenamtlichen Engagements in der Erziehungshilfe"]) {
        assert.equal(merged(name).sources.size, 2, `${name} should carry both sources`)
    }
})

test("a merged record carries fields neither source had alone", () => {
    // The point of the whole exercise. Förderfinder supplies the categories,
    // fdbBund the url — no single-source record has both.
    const { iri } = merged("Förderung der Erziehungsberatungsstellen")
    const block = result.directory.split(/\n(?=cdf:funding-)/).find((b) => b.startsWith(iri))
    for (const p of ["schema:url", "cdf:eligibleApplicant", "cdf:fundingArea", "dct:spatial"]) {
        assert.match(block, new RegExp(p), `${iri} should carry ${p}`)
    }
})

test("same title, different Land does not merge", () => {
    // "Digitalbonus" (Förderfinder, Bayern) against "Digitalbonus Thüringen".
    // token_set_ratio scores this 100 because one title is a subset of the other,
    // which is why the rule sets :matchAlgorithm rather than taking the default.
    // token_sort_ratio scores it 69, and that alone is what rejects it — there is
    // no :hasHardCriterion on dct:spatial; see the note in federation.ttl.
    assert.equal(merged("Digitalbonus Thüringen").sources.size, 1)
})

test("similar title, different subject does not merge", () => {
    // "Wohnraum für Auszubildende" against "…Wohnungen für Studierende und
    // Auszubildende" (Hamburg). Different programmes, and different Länder.
    assert.equal(merged("Wohnraum für Auszubildende").sources.size, 1)
})

test("a genuine pair below the threshold stays split, knowingly", () => {
    // "Digitalbonus" (Förderfinder) and "Digitalbonus Bayern" (fdbBund) are the same
    // programme in the same Land, and token_sort_ratio scores them 0.77 — under the
    // 0.9 the rule sets. Asserted so that lowering :minScore shows up here as an
    // intended change rather than passing silently.
    assert.equal(merged("Digitalbonus Bayern").sources.size, 1)
    assert.equal(merged("Digitalbonus").sources.size, 1)
})

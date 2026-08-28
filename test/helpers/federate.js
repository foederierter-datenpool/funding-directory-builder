// Run the real federate engine (extract → map → match → merge → resolve) over
// hand-picked fixture records, in a throwaway instance.
//
// This is what makes the match rule testable at all. Cross-source overlap only
// exists in the full corpora — 50 of fdbBund's 2531 and 50 of Förderfinder's 218 are
// disjoint slices, so the development sample contains none of it. Rather than ingest
// thousands of records to reach a handful of pairs, the fixtures carry exactly the
// pairs that matter, including the hard negatives that a size-limited sample would
// be unlikely to contain both halves of.
//
// The instance is assembled from the *real* config/federation.ttl and the *real*
// sources/<n>/extract.sparql, so the rule under test is the one that ships. Only
// the data is substituted.

import { federate } from "@directory-builder/core"
import { PATHS } from "@directory-builder/core/utils"
import { lift } from "./pipeline.js"
import path from "path"
import os from "os"
import fs from "fs"

const ROOT = path.join(import.meta.dirname, "../..")

// Build the instance and run federate. `records` is { source: fixturePath }; every
// declared source not named is disabled, so the engine does not look for data that
// is not there.
export async function federateFixtures(records) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fdb-match-"))
    let fed = fs.readFileSync(path.join(ROOT, PATHS.federation), "utf8")

    for (const source of ["fdbBund", "dsee", "euportal", "foerderfinder"]) {
        if (source in records) continue
        // :enabled false is how the engine is told to skip a source; it already
        // appears on every source in the config, so this is a substitution.
        fed = fed.replace(new RegExp(`(:${source}Source a :Source ;[\\s\\S]*?):enabled\\s+true`), "$1:enabled false")
    }
    fs.mkdirSync(path.join(root, "config"), { recursive: true })
    fs.writeFileSync(path.join(root, PATHS.federation), fed)

    for (const [source, fixture] of Object.entries(records)) {
        // extract.sparql is read from sources/<n>/ in the instance root, so the real
        // one is copied in rather than referenced.
        fs.mkdirSync(path.join(root, "sources", source), { recursive: true })
        fs.copyFileSync(path.join(ROOT, PATHS.extractQuery(source)), path.join(root, PATHS.extractQuery(source)))
        const lifted = path.join(root, PATHS.lifted(source))
        fs.mkdirSync(lifted, { recursive: true })
        fs.writeFileSync(path.join(lifted, "fixture.ttl"), lift(source, fixture))
    }

    await federate(root)
    return { root, directory: fs.readFileSync(path.join(root, PATHS.final), "utf8"),
             matches: fs.readFileSync(path.join(root, PATHS.matches), "utf8") }
}

// Minted cluster IRI → the source records it absorbed, read from the match log.
export function clusters(matchesTtl) {
    const out = new Map()
    for (const m of matchesTtl.matchAll(/(\S+)\s+[^;.]*?:hasMember\s+([^;.]+)[;.]/g)) {
        const members = m[2].split(",").map((x) => x.trim()).filter(Boolean)
        out.set(m[1], (out.get(m[1]) ?? []).concat(members))
    }
    return out
}

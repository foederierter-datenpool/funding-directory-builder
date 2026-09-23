// Golden-file tests for each source's extract.sparql.
//
// These exist because the drift check in the engine's validate step is binary: it
// fails when a mapped :fieldPath is missing from the extracted output entirely, but
// a field that still appears on *some* records passes. That is exactly how the DSEE
// extract silently dropped every "Bundesweit" programme — 17 of 50 — while the
// location field went on being populated by the others.
//
// Regold with:  npm run test:update

import { test } from "node:test"
import assert from "node:assert/strict"
import path from "path"
import fs from "fs"
import { run } from "./helpers/pipeline.js"

const HERE = import.meta.dirname
const UPDATE = process.env.UPDATE_FIXTURES === "1"

const CASES = [
    // Both DSEE shapes. The facts box renders several values as <ul>/<li> but a
    // single value as bare text, so a query matching only the list form loses every
    // one-region programme. One fixture of each keeps that regression caught.
    ["dsee", "multi-region.html"],
    ["dsee", "bare-text-region.html"],
    ["fdbBund", "sample.json"],
    ["euportal", "sample.json"],
    ["foerderfinder", "sample.json"],
]

for (const [source, fixture] of CASES) {
    test(`extract ${source}/${fixture}`, async () => {
        const actual = await run(source, path.join(HERE, "fixtures", source, fixture))
        const goldenPath = path.join(HERE, "expected", source, fixture.replace(/\.[^.]+$/, ".nt"))
        if (UPDATE || !fs.existsSync(goldenPath)) {
            fs.mkdirSync(path.dirname(goldenPath), { recursive: true })
            fs.writeFileSync(goldenPath, actual)
            return
        }
        assert.equal(actual, fs.readFileSync(goldenPath, "utf8"))
    })
}

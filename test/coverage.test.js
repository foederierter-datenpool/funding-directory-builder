// Guards the fill rates in coverage-baseline.json. Run the pipeline first — this
// measures data/pipeline/extracted/, so it is skipped when that is absent (a fresh
// clone, or CI without network).
//
// Regold with:  npm run test:coverage -- --update

import { test } from "node:test"
import assert from "node:assert/strict"
import path from "path"
import fs from "fs"
import { measure, compare } from "./coverage.js"

const BASELINE = path.join(import.meta.dirname, "coverage-baseline.json")
const extracted = path.join(import.meta.dirname, "../data/pipeline/extracted")

test("field fill rates have not regressed", { skip: !fs.existsSync(extracted) && "no extracted output; run the pipeline first" }, () => {
    const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null
    assert.deepEqual(compare(measure(), base), [])
})

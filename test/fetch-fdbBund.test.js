// The fdbBund fetch is the only one in this federation that does more than
// transport: it parses CSV and decodes the JSON arrays the export packs into single
// cells. The golden-file tests enter after fetch, so this is the only thing covering
// that logic — and it is logic worth covering, because the failure mode is a
// silently mis-shaped table rather than an error.

import { test } from "node:test"
import assert from "node:assert/strict"
import { parseCsv, toRecords, value } from "../sources/fdbBund/fetch.js"

test("parseCsv: plain rows", () => {
    assert.deepEqual(parseCsv("a,b\n1,2\n"), [["a", "b"], ["1", "2"]])
})

test("parseCsv: quoted field containing a comma", () => {
    assert.deepEqual(parseCsv('a,b\n"x,y",2\n'), [["a", "b"], ["x,y", "2"]])
})

test("parseCsv: quoted field containing a newline", () => {
    // The reason the parser exists. FDB descriptions run to tens of thousands of
    // characters and contain newlines; splitting on "\n" would corrupt the table.
    assert.deepEqual(parseCsv('a,b\n"line1\nline2",2\n'), [["a", "b"], ["line1\nline2", "2"]])
})

test("parseCsv: escaped double quote", () => {
    assert.deepEqual(parseCsv('a\n"he said ""hi"""\n'), [["a"], ['he said "hi"']])
})

test("parseCsv: CRLF line endings and a trailing row without newline", () => {
    assert.deepEqual(parseCsv("a,b\r\n1,2"), [["a", "b"], ["1", "2"]])
})

test("parseCsv: empty fields are preserved, not dropped", () => {
    assert.deepEqual(parseCsv("a,b,c\n1,,3\n"), [["a", "b", "c"], ["1", "", "3"]])
})

test("value: JSON array cells become arrays", () => {
    assert.deepEqual(value('["kommune", "verband_vereinigung"]'), ["kommune", "verband_vereinigung"])
})

test("value: a scalar cell stays a string", () => {
    assert.equal(value("E-Sport-Förderrichtlinie"), "E-Sport-Förderrichtlinie")
})

test("value: a cell that starts with [ but is not JSON stays a string", () => {
    assert.equal(value("[not json"), "[not json")
})

test("value: empty stays empty", () => {
    // The extract's non-empty guards rely on this rather than on null.
    assert.equal(value(""), "")
})

test("toRecords: zips the header and decodes array cells", () => {
    const [header, ...rows] = parseCsv('id_url,funding_area\nx,"[""kultur_medien_sport""]"\n')
    assert.deepEqual(toRecords(rows, header), [{ id_url: "x", funding_area: ["kultur_medien_sport"] }])
})

test("toRecords: drops rows whose arity does not match the header", () => {
    // A truncated download, not a schema change — the header check in main() covers
    // the latter. Dropping is right, but it must not be silent, hence the count
    // reported by the fetch script.
    const rows = [["a", "b"], ["a"]]
    assert.equal(toRecords(rows, ["x", "y"]).length, 1)
})

test("toRecords: honours the limit", () => {
    const rows = [["1"], ["2"], ["3"]]
    assert.equal(toRecords(rows, ["x"], 2).length, 2)
})

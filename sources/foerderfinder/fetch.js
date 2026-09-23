import { harvest, emit, fetchOk } from "@directory-builder/core/fetch"

// Förderfinder Bayern: public, unauthenticated JSON read API behind the SPA at
// foerderfinder.digital (Förderfinder Suite; data model = XFörderleistungs-
// beschreibung / XFLB 2.0.0). foerderfinder.digital serves Bayern only (~212
// programmes). We page the /search endpoint (q="" = all) and write the items[]
// array as one JSON file; the Lift step (src/lift/json.sparql) turns it into RDF
// and the extract step picks out title (attributes.titel) + description
// (attributes.teaser — both already plain text). withPayload stays false; the
// flattened attributes carry everything v1 needs.

const OUT_DIR = process.argv[2]
const BASE_URL = (process.argv[3] ?? "https://foerderfinder.digital/bayern/suche/apicall").replace(/\/$/, "")
// argv[4] = run params JSON; { limit } caps records (0 / absent = no cap).

const { limit } = JSON.parse(process.argv[4] || "{}")
const LIMIT = Number(limit?.[0]) || Infinity
const PAGE = 50
// A cap is rounded up to a page boundary: harvest fetches whole pages, and the
// expectation below has to match what it actually pulls.
const MAX_PAGES = LIMIT === Infinity ? undefined : Math.ceil(LIMIT / PAGE)

// Offset paging over one unpartitioned corpus, so harvest is called with no
// partitions and page N maps to offset (N-1)*PAGE. numFound is the source's own
// total, which is what makes the count check below possible: emit compares it
// against what arrived, so a short harvest fails the run instead of quietly
// producing a smaller directory.
await emit(harvest({
    fetchOne: async (_partition, page) => {
        const url = `${BASE_URL}/search?q=&offset=${(page - 1) * PAGE}&limit=${PAGE}`
        const json = await fetchOk(url).then((r) => r.json())
        return { items: json.items ?? [], total: json.numFound }
    },
    retry: { attempts: 5 },
    maxPages: MAX_PAGES,
}), {
    outDir: OUT_DIR,
    format: "json",
    stem: "results",
    // An uncapped run is checked against numFound by default. A capped one states
    // its own expectation, or emit would read the cap as a truncated harvest.
    expect: LIMIT === Infinity ? {} : { total: MAX_PAGES * PAGE },
})

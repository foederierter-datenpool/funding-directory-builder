# directory-builder
Builds a federated directory from multiple input sources.

## How it works

The logic is **declarative**. The `config/*.ttl` files hold the policy — what to map, how to weight matches, how to merge and resolve — and the code is a generic, source-agnostic engine that interprets them. Each stage then emits more declarative RDF under `data/`, which the next stage and the webapp read in turn. Adding a new source is therefore *almost* config-only.

The exceptions sit at the system's edges, where bespoke code is unavoidable: **fetchers** (`src/fetchers/*.js`, one per source) on the way in, and **exporters** (`webapp/src/exporters/*`) on the way out. The per-source `*.sparql` lift/clean queries are source-specific too, but declarative.


**The declarative core:**

| File | Holds                                                                                            | Interpreted by |
|---|--------------------------------------------------------------------------------------------------|---|
| `config/federation.ttl` | target schema, field mappings, match criteria + weights, merge & resolve rules, per-source label | `pipeline.js` (Map/Match/Merge/Resolve); webapp (`sourceMeta.js`, OrgCard, Map, Match, Download) |
| `config/pipeline.ttl` | step graph + order, source URLs / static dirs, file paths, graph URIs                            | `ingest.js`, `pipeline.js`; webapp (Pipeline, Sources, Map) |
| `config/match-knowledge.ttl` | manual `owl:sameAs` pairs, stop-token lists                                                      | `pipeline.js` (Match); webapp (Match) |
| `src/{lift,clean,transforms}/*.sparql` | how to lift raw→RDF, clean, and transform — per source                                           | `ingest.js` (Lift); `pipeline.js` (Clean, Map) |

**Generated — deterministic artifacts:**

| Artifact | Produced by | Holds | Consumed by |
|---|---|---|---|
| `data/ingest/lifted/*` | Lift | raw source data as RDF | `pipeline.js` (Clean) |
| `data/ingest/ingest-log.ttl` | Fetch | per-source harvest timestamps | webapp (Sources, OrgCard) |
| `data/pipeline/cleaned/*.ttl` | Clean | normalized per-source records | `pipeline.js` (Map); webapp (Map data-flow) |
| `data/pipeline/mapped.ttl` | Map | records in the target schema + `cdp:fromSource` per record | `pipeline.js` (Match); webapp (Map, Match, Sources) |
| `data/pipeline/matches.ttl` | Match | match clusters (`:hasMember`) | `pipeline.js` (Merge); webapp (Match) |
| `data/pipeline/merged.ttl` + `provenance.ttl` | Merge | merged orgs + per-value source provenance (reified `cdp:fromSource`) | `pipeline.js` (Resolve); webapp (Merge, OrgCard) |
| `data/pipeline/final.ttl` | Resolve | the consumer-facing directory | webapp (Directory, Query, Download) |

## Prerequisites
- Node.js
- Java (for [SPARQL Anything](https://github.com/SPARQL-Anything/sparql.anything), auto-downloaded on first run)

## Setup
```sh
npm install
cd webapp && npm install
```

## Run the pipeline
From `src/`:
```sh
node ingest.js
node pipeline.js
```
Outputs &rarr; `data/`

## Run the webapp
From `webapp/`:
```sh
npm run dev
```

## Deployment
Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs the pipeline, builds the webapp, and force-pushes the result as a single-commit onto the `gh-pages` branch where the static webapp is being served from via GitHub Pages.

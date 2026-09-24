# funding-directory-builder
Builds a federated directory of funding opportunities (Förderprogramme) from multiple input sources.

## How it works
This repo is a **use case** of [`@directory-builder/core`](https://github.com/foederierter-datenpool/directory-builder-core)
and holds no engine or webapp code — only what is specific to this federation:

- **Decisions** live in `config/federation.ttl`: the sources and their facts
  (URL, format, lift params), the target schema and field mappings, the
  match/merge/resolve rules, run parameters, repository URL and title.
  `config/curation.ttl` holds curated `owl:sameAs` / `owl:differentFrom` pairs —
  see [Curation](#curation).
- **Per-source code** lives in `sources/<name>/`: a `fetch.js` (how to get the
  data) and an `extract.sparql` (how to reshape its lifted RDF, and flatten
  rich-text values where a source carries HTML).
- **Webapp material** lives in `webapp/`: the About page prose and the Query
  page's starting query.

Everything else is convention: every file path follows from the source names,
so the config contains no paths at all. The engines journal each executed step
as p-plan RDF, and the webapp renders those journals and the pipeline's
artifacts directly — the site is a pure function of `config/` + `data/`,
fetched at runtime.

## Sources

As deployed 2026-09-24: **5231 funding opportunities** in `data/directory.ttl`,
from 5258 source entities with 27 pairs merged across sources.

| source | entities | notes |
| --- | --- | --- |
| Förderdatenbank Bund | 2551 | published CSV export |
| DSEE Förderdatenbank | 1327 | scraped; chunked 200 pages per file so lift starts 7 JVMs, not 1327 |
| EU Funding & Tenders | 1176 | deadlines from 2026 on, `en`/`de` only. The API returns one record per topic **per language** — all 24 — so an unfiltered harvest is 96% duplicate |
| Förderfinder Bayern | 204 | XFLB; the only German source with a structured application deadline |

Counts move a little between harvests — the DSEE listing and the EU portal's
deadline window both shift — so treat these as a snapshot rather than a constant.

`test/coverage-baseline.json` guards the shape of each harvest: a field falling
below its recorded fill rate fails the suite, as does a source losing records or
producing fewer entities than it lifted files.

## Prerequisites
- Node.js
- Java (for [SPARQL Anything](https://github.com/SPARQL-Anything/sparql.anything), auto-downloaded on first run)

## Setup
```sh
npm install
```

## Run the pipeline
```sh
npm run pipeline   # ingest + federate
npm run ingest     # fetch + lift only
npm run federate   # extract → map → match → merge → resolve only
```
Outputs &rarr; `data/`

## Curation

Fuzzy title matching decides most cross-source merges, but not all of them: it
misses pairs one source titles differently ("Digitalbonus" against "Digitalbonus
Bayern", 0.77) and accepts pairs that differ only in substance ("Stipendium für
Medizinstudierende" in two Länder with different commitments, 0.86). Both are
below and above `:minScore` respectively, so no threshold separates them.

So the pairs a score cannot decide are adjudicated by an LLM and the verdicts are
committed:

```sh
npm run curate:prompt                              # → data/curation/judge-prompt.txt
# adjudicate the pairs, save the verdict lines
npm run curate:apply config/curation-verdicts.txt --judge "<model>"
npm run curate:review config/curation-verdicts.txt # cross-check (see caveat below)
```

Three properties make this reviewable rather than magic:

- **It is not a pipeline step.** The generator and the parser are deterministic;
  the judgement happens between them, by hand. `federate` stays a pure function of
  `data/ingest/` + `config/`.
- **Only disagreements are asserted.** A `SAME` below the threshold or a
  `DIFFERENT` above it. Verdicts that agree with the score are left implicit, so
  `config/curation.ttl` shows exactly where judgement overrode the algorithm.
- **The reasoning is tracked.** `config/curation-verdicts.txt` carries one line
  per pair with a reason. Disagree by editing that file and regenerating, not by
  editing the TTL.

Caveat, stated in the generated file too: the verdicts are an LLM's first pass,
not domain review, and `curate:review` cannot yet corroborate them — it compares
against categorical fields whose vocabularies still differ between sources.

## Run the webapp
The webapp ships with `@directory-builder/core`; this repo holds no webapp
code — only the prose under `webapp/` it injects at runtime.
```sh
npm run webapp         # dev server against this repo's config/ + data/
npm run webapp:build   # production build → webapp/dist/
```

## Deployment
Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs the pipeline, builds the webapp, and force-pushes the result as a single-commit onto the `gh-pages` branch where the static webapp is being served from via GitHub Pages.


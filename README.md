# funding-directory-builder
Builds a federated directory of funding opportunities (Förderprogramme) from multiple input sources.

## How it works
This repo is a **use case** of [`@directory-builder/core`](https://github.com/foederierter-datenpool/directory-builder-core)
and holds no engine or webapp code — only what is specific to this federation:

- **Decisions** live in `config/federation.ttl`: the sources and their facts
  (URL, format, lift params), the target schema and field mappings, the
  match/merge/resolve rules, run parameters, repository URL and title.
  `config/curation.ttl` will hold curated `owl:sameAs` pairs once
  cross-source programme matching is enabled.
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

Note: the Förderdatenbank Bund source is declared `:enabled false` — its
~110MB XML export exceeds GitHub's file limit and isn't in the repo yet. The
pipeline skips it and the webapp hides it until its files land under
`sources/fdbBund/static/`.

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
npm run federate   # clean → map → match → merge → resolve only
```
Outputs &rarr; `data/`

## Run the webapp
The webapp ships with `@directory-builder/core`; this repo holds no webapp
code — only the prose under `webapp/` it injects at runtime.
```sh
npm run webapp         # dev server against this repo's config/ + data/
npm run webapp:build   # production build → webapp/dist/
```

## Deployment
Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs the pipeline, builds the webapp, and force-pushes the result as a single-commit onto the `gh-pages` branch where the static webapp is being served from via GitHub Pages.

## Roadmap

- Retrieve Title and Description for a proof of concept ✅
- Retrieve Funding Area as an example for a structured field that can be federated deterministically ⏳
- Think about entity resolution 

# directory-builder
Builds a federated directory from multiple input sources.

TODO: more description, logo, etc.

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

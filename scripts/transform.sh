#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

JAR="tools/sparql-anything.jar"

if [ ! -f "$JAR" ]; then
  ./scripts/download-sparql-anything.sh
fi

for src_dir in sources/*/; do
  name=$(basename "$src_dir")
  query="${src_dir}transform.sparql"
  if [ ! -f "$query" ]; then
    echo "Skipping $name (no transform.sparql)"
    continue
  fi
  out_dir="${src_dir}rdf"
  out="${out_dir}/${name}.ttl"
  mkdir -p "$out_dir"
  echo "Transforming $name -> $out"
  java -jar "$JAR" -q "$query" -f TTL > "$out"
done

echo "Done"

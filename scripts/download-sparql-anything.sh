#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="v1.1.0"
DEST_DIR="tools"
JAR_PATH="$DEST_DIR/sparql-anything.jar"
VERSION_FILE="$DEST_DIR/sparql-anything.version"
URL="https://github.com/SPARQL-Anything/sparql.anything/releases/download/${VERSION}/sparql-anything-${VERSION}.jar"

if [ -f "$JAR_PATH" ] && [ -f "$VERSION_FILE" ] && [ "$(cat "$VERSION_FILE")" = "$VERSION" ]; then
  echo "sparql-anything ${VERSION} already present at $JAR_PATH"
  exit 0
fi

mkdir -p "$DEST_DIR"
echo "Downloading sparql-anything ${VERSION}..."
curl -fSL --retry 3 -o "$JAR_PATH" "$URL"
echo "$VERSION" > "$VERSION_FILE"
echo "Saved to $JAR_PATH"

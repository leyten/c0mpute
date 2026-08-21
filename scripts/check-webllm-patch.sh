#!/usr/bin/env bash
# Refuse to build a browser worker on an unpatched WebLLM.
#
# patches/@mlc-ai+web-llm+0.2.84.patch fixes web-llm#844 (still open upstream):
# the shape-cache LRU disposes ShapeTuples the pipeline still holds, which
# throws "Object has already been disposed" and takes the WebGPU device down
# with it. patch-package applies it from `postinstall`, so it lands on
# `npm install` / `npm ci` and NOWHERE ELSE — and neither build path here runs
# an install of its own. A tree whose node_modules predates the bump therefore
# builds and ships the unpatched engine with no warning at all, which is a
# device hang in a contributor's tab rather than a build failure. Hence this.
set -euo pipefail

cd "$(dirname "$0")/.."

TARGET="node_modules/@mlc-ai/web-llm/lib/index.js"

if [ ! -f "$TARGET" ]; then
  echo "[check] $TARGET is missing — run 'npm ci' before building." >&2
  exit 1
fi

if ! grep -q 'constructor(shapeCacheSize = Infinity)' "$TARGET"; then
  echo "[check] @mlc-ai/web-llm is NOT patched (web-llm#844 shape-cache eviction)." >&2
  echo "[check] Run 'npm ci', or 'npx patch-package', then build again." >&2
  exit 1
fi

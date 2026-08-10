#!/usr/bin/env bash
#
# Build the compute.tech copies of the four static subdomains.
#
# docs/blog/data/shard.compute.tech used to share document roots with their
# c0mpute.ai twins, so any rebrand edit hit both domains. This script instead
# regenerates a Compute Network-branded copy of each site from the c0mpute.ai
# source, into /var/www/compute.tech/<site>, which is what the compute.tech
# server blocks in /etc/nginx/sites-available/compute.tech point at.
#
# The c0mpute.ai sources are read-only here. Nothing this script does can change
# the bytes docs/blog/data/shard.c0mpute.ai serve — re-run it as often as you
# like. Re-run it whenever one of those sources changes; the outputs are derived
# artifacts and are not tracked in git.
#
# Live data (data-site/stats.json, network.json) is symlinked rather than
# copied, so the generated sites keep showing current numbers between builds.
# Those symlinks are READ-ONLY BY CONVENTION: they point back into the
# c0mpute.ai sources, so anything that WRITES to
# /var/www/compute.tech/{data,shard}/*.json writes through into data.c0mpute.ai
# and shard.c0mpute.ai. Generators must keep writing to the c0mpute.ai paths
# and let the links follow.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REBRAND="$REPO/scripts/rebrand-compute-tech.py"

DOCS_SRC="$REPO/docs-site"
BLOG_SRC="$(dirname "$REPO")/c0mpute-blog"
DATA_SRC="$REPO/data-site"
SHARD_SRC="/var/www/shard.c0mpute.ai"

OUT="/var/www/compute.tech"

mkdir -p "$OUT"

# ── docs.compute.tech ────────────────────────────────────────────────────────
# Rebrand the markdown into a generated mirror, then build Docusaurus against
# it. Filenames are preserved, so /why-c0mpute and /c0mpute-code keep their
# routes; only the prose inside changes.
echo "==> docs"
python3 "$REBRAND" "$DOCS_SRC/docs" "$DOCS_SRC/.docs-compute"
cd "$DOCS_SRC"
DOCS_CONTENT_DIR=.docs-compute \
DOCS_BRAND="Compute Network" \
DOCS_WORDMARK="COMPUTE NETWORK" \
DOCS_URL="https://docs.compute.tech" \
DOCS_BASE_URL=/ \
  npx docusaurus build --out-dir "$OUT/docs"

# ── blog.compute.tech ────────────────────────────────────────────────────────
echo "==> blog"
python3 "$REBRAND" "$BLOG_SRC" "$OUT/blog"

# ── data.compute.tech ────────────────────────────────────────────────────────
echo "==> data"
python3 "$REBRAND" "$DATA_SRC" "$OUT/data"
ln -sfn "$DATA_SRC/stats.json"   "$OUT/data/stats.json"
ln -sfn "$DATA_SRC/network.json" "$OUT/data/network.json"

# ── shard.compute.tech ───────────────────────────────────────────────────────
echo "==> shard"
python3 "$REBRAND" "$SHARD_SRC" "$OUT/shard"
ln -sfn "$SHARD_SRC/network.json" "$OUT/shard/network.json"

echo "==> done: $OUT"

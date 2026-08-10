#!/usr/bin/env python3
"""Rewrite c0mpute-branded source into Compute Network source for compute.tech.

The compute.tech subdomains serve the same content as their c0mpute.ai
counterparts under a different brand. Rather than fork the sources and let them
drift, this transform regenerates the compute.tech copy from the c0mpute.ai
source on every build. The c0mpute.ai tree is read-only here and never touched.

What gets renamed is deliberately narrow: the bare word "c0mpute" used as prose.
Identifiers that happen to contain it are load-bearing and are left alone --
model IDs (c0mpute-max), the npm packages (@c0mpute/worker, @c0mpute/code), the
API key prefix (sk-c0mpute-), the worker binary and unit (c0mpute-worker), the
agent's on-disk workspace (.c0mpute/, c0mpute.md), env vars (C0MPUTE_API_URL),
repo paths (leyten/c0mpute-code) and every c0mpute.ai URL. Renaming any of them
would break a real caller. Code blocks are excluded wholesale for the same
reason; the sole exception is the API base URL, which genuinely moves.

Usage:
    rebrand-compute-tech.py <src-dir> <dst-dir>

Copies the tree, transforming .md/.html/.css/.js by content and passing every
other file (fonts, images, JSON) through byte for byte.
"""

import os
import re
import shutil
import sys

BRAND = "Compute Network"
BRAND_UPPER = "COMPUTE NETWORK"

TEXT_SUFFIXES = (".md", ".html", ".css", ".js")

# The API moved to its own hostname. api.compute.tech exposes /v1/* only, so
# this rewrites the documented base URL and nothing else -- notably NOT the
# legacy /api/images/generate endpoint, which that host does not serve.
API_BASE = re.compile(r"(https?://)?c0mpute\.ai/api/v1")

# The wordmark is markup, not text: the zero is wrapped in a span that scales it
# to match the surrounding glyphs. "Compute Network" has no zero to style, so
# the span goes with it. The class stays on the parent, so size/font/colour are
# unchanged.
WORDMARK_UPPER = re.compile(r"C<span[^>]*>0</span>MPUTE")
WORDMARK_LOWER = re.compile(r"c<span[^>]*>0</span>mpute")

# The bare word only: not glued to an identifier character on either side, and
# not the start of a hostname like c0mpute.ai. A trailing period that ends a
# sentence is fine; one that starts a file extension is not.
_BOUNDS = r"(?<![A-Za-z0-9._/@-])%s(?![A-Za-z0-9_/@-])(?!\.[A-Za-z0-9])"
WORD_LOWER = re.compile(_BOUNDS % "c0mpute")
WORD_UPPER = re.compile(_BOUNDS % "C0MPUTE")

# "the c0mpute network" would otherwise become "the Compute Network network".
# The noun is already in the name, so the phrase collapses onto it.
PHRASE_NETWORK = re.compile(_BOUNDS % "c0mpute" + r"\s+network\b")

# Regions whose contents are code, not prose. Markdown fences and inline spans;
# the HTML equivalents. Masked before the word rename and restored after.
CODE_REGIONS = [
    re.compile(r"```.*?```", re.S),      # markdown fenced block
    re.compile(r"`[^`\n]+`"),            # markdown inline span
    re.compile(r"<pre\b.*?</pre>", re.S),
    re.compile(r"<code\b.*?</code>", re.S),
]

_SENTINEL = "\x00CODE%d\x00"


def rebrand(text: str) -> str:
    """Apply the compute.tech rebrand to one file's contents."""
    # Both of these are intentional inside code too: the API base is a real
    # endpoint change, and a wordmark is never inside a code block.
    text = API_BASE.sub(lambda m: (m.group(1) or "") + "api.compute.tech/v1", text)
    text = WORDMARK_UPPER.sub(BRAND_UPPER, text)
    text = WORDMARK_LOWER.sub(BRAND, text)

    stash = []

    def mask(m):
        stash.append(m.group(0))
        return _SENTINEL % (len(stash) - 1)

    for pattern in CODE_REGIONS:
        text = pattern.sub(mask, text)

    text = PHRASE_NETWORK.sub(BRAND, text)
    text = WORD_LOWER.sub(BRAND, text)
    text = WORD_UPPER.sub(BRAND_UPPER, text)

    for i, original in enumerate(stash):
        text = text.replace(_SENTINEL % i, original)
    return text


def main(src: str, dst: str) -> None:
    if os.path.exists(dst):
        shutil.rmtree(dst)
    os.makedirs(dst)

    for root, _dirs, files in os.walk(src):
        out_root = os.path.join(dst, os.path.relpath(root, src))
        os.makedirs(out_root, exist_ok=True)
        for name in files:
            src_path = os.path.join(root, name)
            out_path = os.path.join(out_root, name)
            if name.endswith(TEXT_SUFFIXES):
                with open(src_path, encoding="utf-8") as fh:
                    content = fh.read()
                with open(out_path, "w", encoding="utf-8") as fh:
                    fh.write(rebrand(content))
            else:
                shutil.copy2(src_path, out_path)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

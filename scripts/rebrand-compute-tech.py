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

# ── paper palette for the three static sites ──────────────────────────────────
# blog, data and shard each declare their own :root palette solved for ink. They
# have no theme toggle and never will — they are documents, not apps — so the
# compute.tech copies simply ARE light. Appending an override after the original
# :root wins on source order without editing the c0mpute.ai sources at all.
#
# Values are solved against #faf8f6, not inverted: each dark value's contrast
# ratio against #0c0a09 was matched on paper.
PAPER_VARS = {
    "--bg": "#faf8f6", "--pop": "#f1ede8", "--page": None,
    "--text": "rgba(20,18,16,0.82)", "--head": "#141210", "--heading": "#141210",
    "--meta": "rgba(20,18,16,0.56)", "--dim": "rgba(20,18,16,0.6)",
    "--faint": "rgba(20,18,16,0.5)", "--line": "rgba(20,18,16,0.12)",
    "--surface": "rgba(20,18,16,0.035)", "--steel": "#3a5a7d",
    "--live": "rgba(6,120,80,0.95)",
}

# ── ink for paper ─────────────────────────────────────────────────────────────
# These three sites were written for a dark ground and say so literally: the
# stylesheets and the chart code carry rgba(255,255,255,A) and #fff inline
# rather than going through the :root palette, so overriding the variables left
# most of the page white-on-white. Rewrite the literals too. Alpha is kept as
# written — 58% ink on paper reads about as 58% white does on ink.
# The alpha is sometimes a template interpolation rather than a literal — the
# chart code builds `rgba(255,255,255,${a})` per bar — so match anything that is
# not a closing paren and hand it back untouched.
WHITE_RGBA = re.compile(r"rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([^)]+?)\s*\)")
WHITE_HEX = re.compile(r"#fff(?:fff)?\b", re.I)

def ink_for_paper(text):
    text = WHITE_RGBA.sub(lambda m: f"rgba(20, 18, 16, {m.group(1)})", text)
    return WHITE_HEX.sub("#141210", text)

# Links back to the network's own properties should stay on the domain the
# reader is already on. GitHub and other outside hosts are left alone.
OWN_HOSTS = re.compile(r"https://(docs|blog|data|shard)\.c0mpute\.ai")
OWN_ROOT = re.compile(r"https://c0mpute\.ai(?![a-zA-Z0-9./-])")
OWN_ROOT_TEXT = re.compile(r"(?<![A-Za-z0-9._/@-])c0mpute\.ai(?![A-Za-z0-9_/-])")

def own_links(text):
    text = OWN_HOSTS.sub(lambda m: f"https://{m.group(1)}.compute.tech", text)
    text = OWN_ROOT.sub("https://compute.tech", text)
    return OWN_ROOT_TEXT.sub("compute.tech", text)

def paper_override(text):
    """Append a light :root after the site's own, for CSS or inline <style>."""
    if ":root" not in text:
        return text
    decls = "".join(f"  {k}: {v};\n" for k, v in PAPER_VARS.items() if v)
    block = "\n/* compute.tech serves these documents on paper. */\n:root{\n" + decls + "}\n"
    if "</style>" in text:                      # inline stylesheet
        return text.replace("</style>", block + "</style>", 1)
    return text + block                          # standalone .css


# The API moved to its own hostname. api.compute.tech exposes /v1/* only, so
# this rewrites the documented base URL and nothing else -- notably NOT the
# legacy /api/images/generate endpoint, which that host does not serve.
API_BASE = re.compile(r"(https?://)?c0mpute\.ai/api/v1")
# The three static sites point their favicon at the old domain absolutely, so a
# compute.tech visitor gets the c0mpute mark in the tab. Swap it for the new one,
# served from this domain rather than borrowed from the other.
FAVICON = re.compile(r"https?://c0mpute\.ai/favicon\.ico")

# ── one title per surface ─────────────────────────────────────────────────────
# Compute Network names every tab "Compute Network / <Page>" -- the app, the
# docs and these three static sites -- so a reader with a row of tabs open can
# see which network they belong to. The c0mpute.ai sources keep the titles they
# have; only these generated copies are renamed.
#
# Which site a file belongs to is legible from the title it already carries: the
# blog suffixes the brand ("blog -- c0mpute"), while data and shard prefix it
# ("c0mpute / data"). These run after the word rename, so by now the brand in
# those strings reads "Compute Network".
BLOG_TITLE = re.compile(r"<title>[^<]*—\s*Compute Network</title>")

# "data" and "network" are the labels those two sites give themselves, and each
# says it twice: once in the tab, once in the header lockup beside the wordmark
# -- the tab as a single string, the lockup as a "/ label" span next to it.
# Rewrite both, or the tab and the page it names disagree. "network" becomes
# "Map" because the page is the network map, and "Compute Network / network"
# says the word twice.
SUB_LABELS = {"data": "Data", "network": "Map"}
TITLE_LABEL = re.compile(r"(Compute Network / )(data|network)\b")
LOCKUP_LABEL = re.compile(r'(<span class="brand-sub">\s*/\s*)(data|network)(\s*</span>)')


def page_titles(text):
    text = BLOG_TITLE.sub("<title>Compute Network / Blog</title>", text)
    text = TITLE_LABEL.sub(lambda m: m.group(1) + SUB_LABELS[m.group(2)], text)
    return LOCKUP_LABEL.sub(
        lambda m: m.group(1) + SUB_LABELS[m.group(2)] + m.group(3), text
    )


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
    text = FAVICON.sub("/favicon.svg", text)
    # Only stylesheets carry a :root; paper_override no-ops on anything else.
    text = paper_override(text)
    text = ink_for_paper(text)
    text = own_links(text)
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

    # Last, because it reads the brand name the rename above just wrote in.
    return page_titles(text)


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

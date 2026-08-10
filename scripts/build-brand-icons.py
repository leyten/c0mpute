#!/usr/bin/env python3
"""Rasterise the brand tile into the two binary icon formats the web needs.

public/brand/favicon.svg is the single source of truth for the mark. Browsers
still fetch /favicon.ico from the site root by convention regardless of what
<link rel="icon"> declares, and iOS reads a PNG for the home screen, so the same
artwork has to exist as bitmaps. Deriving both from the one SVG here is what
keeps them from drifting apart, which is exactly how the previous
apple-touch-icon ended up inverted and drawing a different mark.

Note the output path: public/brand/favicon.ico, NOT public/favicon.ico. The
latter is c0mpute.ai's legacy icon and must keep its exact bytes — the two
domains share this one Next deployment. nginx is what routes compute.tech's
/favicon.ico to the file written here.

Every .ico frame is rendered from the vector at its own target size — no frame
is a rescaled copy of another, so the 16px one is sharp rather than a mush of a
larger raster.

The apple-touch icon is deliberately full-bleed square with rx=0, at the 180px
Apple asks for (60pt at @3x). Consumers round it themselves — Apple's own
illustration of a website icon shows a system-applied radius, and the web app
manifest spec says outright that a user agent may round the corners — so baked-in
corners would be rounded a second time and leave a notch at each one. Worth
knowing that Apple documents this for app icons and never for web clips
specifically; nothing contradicts it, but it is inference, not a cited rule.

It is also flattened onto opaque paper. The often-repeated claim that iOS
composites alpha against black is community lore rather than anything Apple
documents, so it is not the reason: the reason is that Android's add-to-home-screen
path only treats an icon as square-and-safe when all four corners are opaque, and
audit tooling requires opacity outright. A transparent corner loses on both
counts, whatever iOS does with it.

Usage: python3 scripts/build-brand-icons.py
"""

import io
import pathlib

import cairosvg
from PIL import Image

REPO = pathlib.Path(__file__).resolve().parent.parent
SRC = REPO / "public" / "brand" / "favicon.svg"

ICO_SIZES = (16, 32, 48)
APPLE_SIZE = 180
PAPER = (250, 248, 246)  # #faf8f6, the tile ground


def render(svg: bytes, size: int) -> Image.Image:
    png = cairosvg.svg2png(bytestring=svg, output_width=size, output_height=size)
    return Image.open(io.BytesIO(png)).convert("RGBA")


def main() -> None:
    svg = SRC.read_bytes()

    frames = [render(svg, s) for s in ICO_SIZES]
    frames[-1].save(
        REPO / "public" / "brand" / "favicon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames[:-1],
    )

    square = render(svg.replace(b'rx="20"', b'rx="0"'), APPLE_SIZE)
    flat = Image.new("RGB", (APPLE_SIZE, APPLE_SIZE), PAPER)
    flat.paste(square, mask=square.split()[3])
    flat.save(REPO / "public" / "brand" / "apple-touch-icon.png", format="PNG")


if __name__ == "__main__":
    main()

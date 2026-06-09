---
sidebar_position: 7
title: Image generation
---

# Image generation

c0mpute generates images, not just text. Open [c0mpute.ai/create](https://c0mpute.ai/create), describe what you want, and the network renders it. It follows the same three principles as the rest of c0mpute: **uncensored, private, decentralized**.

## How it works

You write a prompt and hit **Generate**. Your request goes to the orchestrator, which dispatches it to an available image worker — an independent GPU running ComfyUI with the Chroma1-HD model. The finished image is returned to you. The render runs on a contributor's GPU, not on c0mpute's hardware.

## Privacy

Images are **never stored** on c0mpute's servers. The image is returned to you and then dropped — no server-side copy, no public gallery, no retained prompt history. Your generations are saved only in your **own browser**, and you can delete them anytime. To keep an image, download it; that's the only lasting copy.

## Content policy

The model is uncensored, with one hard limit: **no sexual content involving minors**, enforced on the prompt before anything is generated. Adult (NSFW) content sits behind an **18+ toggle**, off by default. With the toggle off, an output classifier keeps adult content from being returned; with it on, nothing is scanned.

## Using /create

- **Prompt** — describe the image. Writing it like a real photo (`candid photo, 35mm film, natural light`) beats stacking quality words like "ultra detailed, 8k, sharp".
- **Style presets** — Photo (default), Cinematic, Anime, Digital Art, 3D. Photo is tuned for realism rather than the over-processed "AI" look.
- **Aspect ratio** — Square (1024×1024), Portrait (832×1216), Landscape (1216×832).
- **NSFW (18+)** — toggle to allow adult content, with a one-time age confirmation.
- **Advanced** — negative prompt, steps, guidance (CFG), and seed.

## Pricing

Flat **20 credits ($0.20) per image**, drawn from your credit balance or your staker daily allowance. You're charged on success and **refunded automatically** if a render fails.

## Model

[Chroma1-HD](https://huggingface.co/lodestones/Chroma1-HD) — an open, uncensored, Flux-architecture image model. c0mpute ships tuned defaults (a baseline anti-"slop" negative prompt and real-photo styling) so a plain prompt comes out looking like a photograph instead of a render.

## API

Image generation is also available over HTTP — see the [API reference](/api-reference#image-generation).

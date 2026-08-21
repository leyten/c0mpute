---
sidebar_position: 1
title: Overview
---

# Native worker overview

Native workers run **Qwen3.8 27B Uncensored** on your machine via ollama — the network's model, registered as `qwen3.8-27b-uncensored`. They serve the 27B requests and earn **3-5x more** than browser workers.

## Why go native?

- **Higher earnings** — 27B jobs pay significantly more than browser jobs
- **Better model** — 27B parameter model produces higher quality responses
- **Real GPU utilization** — uses CUDA, Metal, or Vulkan for full hardware acceleration
- **Runs headless** — no browser tab needed, runs as a background process or service

## Requirements

- **Node.js 18+** (22+ recommended)
- **ollama v0.32.15 or newer** — the worker checks the version at startup and tells you to upgrade if it's older
- One of:
  - **NVIDIA GPU with 16GB+ VRAM** (24GB recommended — RTX 3090, 4090, 5090)
  - **AMD GPU with 24GB+ VRAM** (RX 7900 XTX, via Vulkan)
  - **Apple Silicon Mac with 32GB+ unified memory**

  12GB cards and 16/24GB Macs are below the bar — they can't hold the model.
- **~36GB free disk space** — the downloaded weights are kept alongside ollama's copy (~20GB on macOS)
- **Stable internet connection**

## Quick start

```bash
npx @compute-network/worker --token <your-token>
```

That's it. One command. The worker downloads the weights, builds the right model for your hardware, and detects your GPU automatically.

## One model, no picker

The network serves **one public text model**, so there is nothing to choose: every native worker runs Qwen3.8 27B Uncensored. The old `--model` flag is deprecated and ignored. Startup asks one question — **Qwen worker (text)** or **Image worker** — and remembers the answer; skip it with `--mode max` (the historical name for the text mode) or `--mode image`.

## Which build you get

The worker picks the build from the hardware it finds. There is nothing to configure:

| Hardware | Build | Speculative decoding |
| --- | --- | --- |
| NVIDIA, 24GB+ | GGUF Q4_K_M | Yes |
| NVIDIA, 16GB | GGUF IQ4_XS | Yes |
| Several small NVIDIA cards, none big enough alone | one layer-split worker (noMTP build) | No |
| AMD, 24GB+ | GGUF Q4_K_M | No |
| Apple Silicon, 32GB+ | GGUF noMTP Q4_K_M, on Metal | No (never on Metal) |

Speculative decoding uses the model's own MTP head — it's lossless (same output, just fewer forward passes) and up to ~2.4x faster on code-heavy jobs.

GGUF weights are pulled from a pinned HuggingFace revision into `~/.config/compute-worker/models` and kept there, so rebuilding the model doesn't re-download it. The context window is sized to your VRAM (8K-32K) and baked into the build.

## Multi-GPU rigs

More than one NVIDIA card? The worker detects them all and runs **one worker per capable GPU** automatically — no flags. Cards under 16GB are skipped, and if no single card can hold the model, the CLI runs one layer-split worker across the cards instead. Each card gets its own pinned ollama, logs are prefixed `[gpu N]`, and `--gpu 3` / `--gpu 0,2,5` narrows it to the cards you choose. One prerequisite: stop any ollama already running on the box first, or GPU 0's worker adopts it and that daemon sees every card.

Full details, including the first-run download order and the 10-workers-per-IP cap: [Linux setup → Multi-GPU rigs](/worker-guide/native-worker/linux#multi-gpu-rigs).

## Get your token

1. Go to [c0mpute.ai/earn](https://c0mpute.ai/earn)
2. Log in with your X (Twitter) account
3. Scroll to **Native Worker** section
4. Click **Get Worker Token**
5. Copy and save the token — it's shown only once

See [Worker tokens](/worker-guide/tokens) for more details.

## Keeping the worker up to date

The worker has **no auto-update**: it runs exactly the version you installed, and nothing self-upgrades at startup. Upgrading is an explicit step:

```bash
npm i -g @compute-network/worker@latest                       # global install
npx -y @compute-network/worker@latest --token <your-token>    # or pin @latest in your npx command
```

Every start prints its version (`c0mpute worker v…`), so you can always tell what a box is running.

## Platform guides

- [Linux setup](/worker-guide/native-worker/linux) — NVIDIA CUDA
- [Windows setup](/worker-guide/native-worker/windows) — WSL recommended
- [macOS setup](/worker-guide/native-worker/macos) — Apple Silicon / Metal
- [Troubleshooting](/worker-guide/native-worker/troubleshooting) — common issues

## Image worker

A native worker can run as an **image worker** instead of a text worker — it serves the [image generation](/image-generation) network by running ComfyUI + the Chroma1-HD model on your GPU, and earns per render.

```bash
npx @compute-network/worker --mode image --token <your-token>
```

On first run without `--mode`, the worker asks whether to run as a **Qwen (text)** worker or an **Image** worker and remembers your choice. Image mode downloads only the image model (~14GB), not the text model. A 24GB GPU (RTX 3090/4090) is recommended. Set `COMFY_DIR` if you want the worker to install/launch ComfyUI for you; otherwise point `COMFY_URL` at a ComfyUI you already run.

---
sidebar_position: 1
title: Overview
---

# Native worker overview

Native workers run Qwen3.5 27B (abliterated/uncensored) on your machine via ollama. They serve Max tier requests and earn **3-5x more** than browser workers.

## Why go native?

- **Higher earnings** — Max tier jobs pay significantly more than Pro
- **Better model** — 27B parameter model produces higher quality responses
- **Real GPU utilization** — uses CUDA, Metal, or Vulkan for full hardware acceleration
- **Runs headless** — no browser tab needed, runs as a background process or service

## Requirements

- **Node.js 18+** (22+ recommended)
- **ollama** installed (the worker pulls and runs the model through it)
- **GPU with 20GB+ VRAM recommended** (or 32GB+ unified memory on Apple Silicon):
  - NVIDIA: RTX 3090, RTX 4090, etc.
  - Apple Silicon: M1 Max/Ultra, M2/M3/M4 Max (32GB+ RAM)
  - AMD: RX 7900 XTX (via Vulkan)
- **~17GB disk space** for the model (downloaded on first run)
- **Stable internet connection**

## Quick start

```bash
npx @c0mpute/worker --token <your-token>
```

That's it. One command. ollama handles model download and GPU detection automatically.

## Get your token

1. Go to [c0mpute.ai/worker](https://c0mpute.ai/worker)
2. Log in with your X (Twitter) account
3. Scroll to **Native Worker** section
4. Click **Get Worker Token**
5. Copy and save the token — it's shown only once

See [Worker tokens](/worker-guide/tokens) for more details.

## Platform guides

- [Linux setup](/worker-guide/native-worker/linux) — NVIDIA CUDA
- [Windows setup](/worker-guide/native-worker/windows) — WSL recommended
- [macOS setup](/worker-guide/native-worker/macos) — Apple Silicon / Metal
- [Troubleshooting](/worker-guide/native-worker/troubleshooting) — common issues

## Image worker

A native worker can run as an **image worker** instead of a text worker — it serves the [image generation](/image-generation) network by running ComfyUI + the Chroma1-HD model on your GPU, and earns per render.

```bash
npx @c0mpute/worker --mode image --token <your-token>
```

On first run without `--mode`, the worker asks whether to run as a **Max (text)** worker or an **Image** worker and remembers your choice. Image mode downloads only the image model (~14GB), not the text model. A 24GB GPU (RTX 3090/4090) is recommended. Set `COMFY_DIR` if you want the worker to install/launch ComfyUI for you; otherwise point `COMFY_URL` at a ComfyUI you already run.

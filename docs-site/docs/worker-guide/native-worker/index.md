---
sidebar_position: 1
title: Overview
---

# Native worker overview

Native workers run Qwen2.5 14B (abliterated/uncensored) on your machine using node-llama-cpp. They serve Max tier requests and earn **3-5x more** than browser workers.

## Why go native?

- **Higher earnings** — Max tier jobs pay significantly more than Free or Pro
- **Better model** — 14B parameter model produces higher quality responses
- **Real GPU utilization** — uses CUDA, Metal, or Vulkan for full hardware acceleration
- **Runs headless** — no browser tab needed, runs as a background process or service

## Requirements

- **Node.js 18+** (22+ recommended)
- **GPU with 10GB+ VRAM:**
  - NVIDIA: GTX 1080 Ti, RTX 3060 12GB, RTX 3080, RTX 4070+, etc.
  - Apple Silicon: M1 (16GB RAM), M2, M3, M4
  - AMD: RX 6800+, RX 7800+ (via Vulkan)
- **~10GB disk space** for the model (downloaded on first run)
- **Stable internet connection**

## Quick start

```bash
npx @c0mpute/worker --token <your-token>
```

That's it. One command. node-llama-cpp handles model download, GPU detection, and compilation automatically.

## Get your token

1. Go to [c0mpute.ai/worker](https://c0mpute.ai/worker)
2. Login with Privy
3. Scroll to **Native Worker** section
4. Click **Get Worker Token**
5. Copy and save the token — it's shown only once

See [Worker tokens](/worker-guide/tokens) for more details.

## Platform guides

- [Linux setup](/worker-guide/native-worker/linux) — NVIDIA CUDA
- [Windows setup](/worker-guide/native-worker/windows) — WSL recommended
- [macOS setup](/worker-guide/native-worker/macos) — Apple Silicon / Metal
- [Troubleshooting](/worker-guide/native-worker/troubleshooting) — common issues

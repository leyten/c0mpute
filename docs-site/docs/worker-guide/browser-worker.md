---
sidebar_position: 1
title: Browser worker
---

# Browser worker quick start

Turn your browser tab into a GPU worker and start earning SOL. No installation required.

## Setup

1. Go to [c0mpute.ai/worker](https://c0mpute.ai/worker)
2. Login with Privy (email, wallet, or social)
3. Select a model:
   - **Qwen 1.5B** — ~900MB download, lower VRAM, serves Free tier
   - **Dolphin 7B** — ~4GB download, needs decent GPU, serves Pro tier (2x earnings)
4. Click **Start Worker**

The first time you start, the model downloads to your browser's cache. This takes a few minutes depending on your connection. After that, subsequent starts are instant.

## Running

Once the model is loaded, your browser is actively processing jobs from the c0mpute network. The worker page shows real-time stats:

- **SOL earned** — your total earnings for this session
- **Uptime** — how long the worker has been running
- **Jobs completed** — number of inference requests processed
- **tok/s** — your current token generation speed

Keep the tab open and active. If you close it or navigate away, the worker stops.

## Tips

- **Use Chrome or Edge** — they have the best WebGPU support
- **Don't minimize the tab** — some browsers throttle background tabs, which kills performance
- **Dolphin 7B earns 2x** — if your GPU can handle it, pick the bigger model
- **Check your GPU** — open `chrome://gpu` to verify WebGPU is enabled and using your discrete GPU
- **Multiple tabs don't help** — one worker per browser instance. Running two will fight over VRAM.

## Requirements

- A browser with WebGPU support (Chrome 113+, Edge 113+, Firefox 130+ with flag)
- For Qwen 1.5B: any modern GPU with ~1GB free VRAM
- For Dolphin 7B: a GPU with ~4GB free VRAM (RTX 3060+, M1+, etc.)

## Earnings

Workers earn SOL for every completed job. Earnings depend on:

- **Model served** — Dolphin 7B jobs pay 2x what Qwen 1.5B jobs pay
- **Tokens generated** — longer responses earn more
- **Availability** — workers who stay online longer get more jobs

Earnings are tracked on the worker page and tied to your Privy account.

---
sidebar_position: 1
title: Browser worker
---

# Browser worker quick start

Turn your browser tab into a GPU worker and start earning USDC. No installation required.

## Setup

1. Go to [c0mpute.ai/worker](https://c0mpute.ai/worker)
2. Log in with your X (Twitter) account
3. Browser workers run **Qwen3 8B Uncensored** — ~4.3GB download, needs ~6GB VRAM, serves Pro tier
4. Click **Start Worker**

The first time you start, the model downloads to your browser's cache. This takes a few minutes depending on your connection. After that, subsequent starts are instant.

## Running

Once the model is loaded, your browser is actively processing jobs from the c0mpute network. The worker page shows real-time stats:

- **USDC earned** — your total claimable earnings
- **Uptime** — how long the worker has been running
- **Jobs completed** — number of inference requests processed
- **tok/s** — your current token generation speed

Keep the tab open and active. If you close it or navigate away, the worker stops.

## Tips

- **Use Chrome or Edge** — they have the best WebGPU support
- **Don't minimize the tab** — some browsers throttle background tabs, which kills performance
- **Check your GPU** — open `chrome://gpu` to verify WebGPU is enabled and using your discrete GPU
- **Multiple tabs don't help** — one worker per browser instance. Running two will fight over VRAM.

## Requirements

- A browser with WebGPU support (Chrome 113+, Edge 113+, Firefox 130+ with flag)
- A GPU with ~6GB free VRAM (RTX 3060+, M1+, etc.) to run Qwen3 8B Uncensored

## Earnings

Workers earn **70% of the USD value of the credits spent** on every job they complete, paid out in USDC. Earnings depend on:

- **Tokens generated** — longer responses spend more credits, so they earn more
- **Availability** — workers who stay online longer get more jobs

**Stake to earn more.** Workers who stake at least 1,000,000 <span class="dollar">$</span>ZERO (held 24h) earn an **80%** share instead of 70% on every job. See [The <span class="dollar">$</span>ZERO Token](/zero-token#worker-boost).

Earnings are tracked on the worker page and tied to your account. Withdraw your balance to any Solana wallet as USDC whenever you like.

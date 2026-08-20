---
sidebar_position: 1
title: Browser worker
---

# Browser worker quick start

Turn your browser tab into a GPU worker and start earning USDC. No installation required.

## Setup

1. Go to [c0mpute.ai/earn](https://c0mpute.ai/earn)
2. Log in with your X (Twitter) account
3. **On a laptop, point Chrome at your real GPU first.** Open `chrome://flags/#force-high-performance-gpu`, set it to **Enabled** and restart the browser. On Windows laptops Chrome generally runs on the integrated GPU, and a page asking for a high-performance adapter does not change that — so without this flag a machine with a discrete card can end up doing all the work on integrated graphics, many times slower.
4. Browser workers run **Qwen3 8B Uncensored** — ~4.3GB download, needs ~6GB VRAM, serves the browser lane (`c0mpute-pro` requests and free prompts)
5. Click **Start Worker**

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
- **A second tab fits on a large card, but don't count on it** — each worker needs roughly 5.2GB (4.3GB of weights, ~576MB of KV cache at 4k context, ~160MB of workspace), so a 24GB card has room for three. They still share one GPU, and we have not measured whether two tabs together out-earn one. On an 8GB card there is only room for one.

## Requirements

- A browser with WebGPU support (Chrome 113+, Edge 113+, Firefox 130+ with flag)
- A GPU with ~6GB free VRAM (RTX 3060+, M1+, etc.) to run Qwen3 8B Uncensored

## Earnings

Workers earn **70% of the USD value of the credits spent** on every job they complete, paid out in USDC. Earnings depend on:

- **Tokens generated** — longer responses spend more credits, so they earn more
- **Availability** — workers who stay online longer get more jobs

**Stake to earn more.** Workers who stake at least 500,000 <span class="dollar">$</span>ZERO (held 24h) earn an **80%** share instead of 70% on every job. See [Staking](/staking#worker-boost).

Earnings are tracked on the worker page and tied to your account. Withdraw your balance to any Solana wallet as USDC whenever you like.

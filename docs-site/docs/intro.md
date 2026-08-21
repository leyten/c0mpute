---
slug: /
sidebar_position: 1
title: What is Compute Network?
---

# What is Compute Network?

Compute Network is a decentralized AI inference network. Instead of routing your prompts through corporate data centers, Compute Network connects you directly to a distributed network of GPU workers — regular people sharing their compute power.

**AI powered by people, not data centers.**

## How it works

You send a message. The orchestrator finds an available worker. The worker runs the model on their GPU and streams tokens back to you in real-time. Your prompts aren't stored, and the worker never sees who you are — it gets the text and nothing else. No corporate filter deciding what you're allowed to ask.

## One model

Chat runs on **Qwen3.8 27B Uncensored** (`qwen3.8-27b-uncensored`) — one model for the whole network, so there's nothing to pick. It's uncensored, and it does web search, vision (send it an image), and an extended thinking mode.

| Model | Cost | Where it runs | Notes |
|-------|------|---------------|-------|
| **Qwen3.8 27B Uncensored** | about 1 credit a message | Native workers | uncensored; web search + tools, image input, thinking mode |

The [API](/api-reference) exposes two more ids: `c0mpute-pro`, an uncensored 8B served by the browser worker pool, and `c0mpute-swarm`, MiniMax-M2.5 split across a swarm of GPUs. Both bill at the same per-token rate. [Image generation](/image-generation) runs on its own pool of image workers.

## Credits and the <span class="dollar">$</span>ZERO token

Inference is paid for with credits. A credit is **$0.001**, and a dollar buys 500 of them. You don't need any token to use Compute Network.

- Sign in and you get free credits every day. A [plan](/user-guide/plans) gives you more
- Top up with USDC for anything past the day's credits; text is billed per token
- Workers earn 70% of the USD value of the credits spent on jobs they complete (80% if they stake), paid in USDC

<span class="dollar">$</span>ZERO is a separate, value-accrual token. Network revenue automatically buys it back and burns it, and pays a share to everyone who stakes it.

See [The <span class="dollar">$</span>ZERO Token](/zero-token) for the full breakdown.

## The stack

- **Browser workers** use [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) via WebLLM to run models directly in the browser tab
- **Native workers** use [ollama](https://ollama.com) with CUDA, Metal, or Vulkan acceleration
- The **orchestrator** is a Socket.io server that handles job routing, worker matching, and real-time token streaming

## Why?

Centralized AI providers censor their models, log your prompts, and can revoke access at any time. Compute Network is the alternative — private, uncensored, and owned by no one.

Anyone can [use Compute Network](/user-guide/getting-started) or [contribute compute](/worker-guide/browser-worker) and start earning.

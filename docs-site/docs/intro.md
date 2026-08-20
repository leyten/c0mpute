---
slug: /
sidebar_position: 1
title: What is c0mpute?
---

# What is c0mpute?

c0mpute is a decentralized AI inference network. Instead of routing your prompts through corporate data centers, c0mpute connects you directly to a distributed network of GPU workers — regular people sharing their compute power.

**AI powered by people, not data centers.**

## How it works

You send a message. The orchestrator finds an available worker. The worker runs the model on their GPU and streams tokens back to you in real-time. Your prompts aren't stored, and the worker never sees who you are — it gets the text and nothing else. No corporate filter deciding what you're allowed to ask.

## One model

Chat runs on **Qwen3.8 27B Uncensored** (`qwen3.8-27b-uncensored`) — one model for the whole network, so there's nothing to pick. It's uncensored, and it does web search, vision (send it an image), and an extended thinking mode.

| Model | Cost | Where it runs | Notes |
|-------|------|---------------|-------|
| **Qwen3.8 27B Uncensored** | 15 credits (20 with thinking) | Native workers | uncensored; web search + tools, image input, thinking mode |

The [API](/api-reference) exposes two more ids: `c0mpute-pro`, an uncensored 8B served by the browser worker pool (10 credits), and `c0mpute-swarm`, MiniMax-M2.5 split across a swarm of GPUs (10 credits). [Image generation](/image-generation) runs on its own pool of image workers.

## Credits and the <span class="dollar">$</span>ZERO token

Inference is paid for with credits. **1 credit = $0.01**, bought with USDC. You don't need any token to use c0mpute.

- Top up credits with USDC; they're spent per message
- Workers earn 70% of the USD value of the credits spent on jobs they complete (80% if they stake), paid in USDC

<span class="dollar">$</span>ZERO is a separate, value-accrual token. Network revenue automatically buys it back and burns it, and pays a share to everyone who stakes it.

See [The <span class="dollar">$</span>ZERO Token](/zero-token) for the full breakdown.

## The stack

- **Browser workers** use [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) via WebLLM to run models directly in the browser tab
- **Native workers** use [ollama](https://ollama.com) with CUDA, Metal, or Vulkan acceleration
- The **orchestrator** is a Socket.io server that handles job routing, worker matching, and real-time token streaming

## Why?

Centralized AI providers censor their models, log your prompts, and can revoke access at any time. c0mpute is the alternative — private, uncensored, and owned by no one.

Anyone can [use c0mpute](/user-guide/getting-started) or [contribute compute](/worker-guide/browser-worker) and start earning.

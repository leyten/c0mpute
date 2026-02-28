---
slug: /
sidebar_position: 1
title: What is c0mpute?
---

# What is c0mpute?

c0mpute is a decentralized AI inference network. Instead of routing your prompts through corporate data centers, c0mpute connects you directly to a distributed network of GPU workers — regular people sharing their compute power.

**AI powered by people, not data centers.**

## How it works

You send a message. The orchestrator finds an available worker. The worker runs the model on their GPU and streams tokens back to you in real-time. No middleman logging your prompts. No corporate filter deciding what you're allowed to ask.

## Three tiers

| Tier | Model | Where it runs | Notes |
|------|-------|---------------|-------|
| **Free** | Qwen 1.5B | Browser (WebGPU) | ~900MB, fast, basic |
| **Pro** | Dolphin Mistral 7B | Browser (WebGPU) | ~4GB VRAM, uncensored |
| **Max** | Qwen2.5 14B abliterated | Native workers | ~9GB, uncensored + web search |

## The stack

- **Browser workers** use [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) via WebLLM to run models directly in the browser tab
- **Native workers** use [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) with CUDA, Metal, or Vulkan acceleration
- The **orchestrator** is a Socket.io server that handles job routing, worker matching, and real-time token streaming
- Workers earn **SOL** for every job they complete

## Why?

Centralized AI providers censor their models, log your prompts, and can revoke access at any time. c0mpute is the alternative — private, uncensored, and owned by no one.

Anyone can [use c0mpute](/user-guide/getting-started) or [contribute compute](/worker-guide/browser-worker) and start earning.

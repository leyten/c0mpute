---
sidebar_position: 3
title: How it works
---

# How c0mpute works

## The flow

```
User → Orchestrator → Worker → tokens stream back → User
```

1. You send a message from the c0mpute.ai chat interface
2. The orchestrator receives your request and finds a matching worker based on your selected tier
3. The worker runs inference on their GPU and streams tokens back through the orchestrator
4. You see the response appear in real-time, word by word

## The orchestrator

The orchestrator is a Node.js server using Socket.io for real-time communication. It handles:

- **Authentication** — verifying users and workers via Privy
- **Job queue** — managing incoming requests and matching them to available workers
- **Worker registry** — tracking which workers are online, their capabilities, and current load
- **Routing** — directing jobs to the right worker type based on the selected tier
- **Search** — running web searches for Max tier requests and injecting context
- **Stats** — broadcasting real-time network statistics every 5 seconds

The orchestrator does not store conversations. It routes traffic and moves on.

## Browser workers

Browser workers run LLMs directly in your browser tab using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) through the WebLLM library. No installation required — just open the page and click start.

Two models are available for browser workers:
- **Qwen 1.5B** — serves Free tier requests. ~900MB download, runs on most modern GPUs.
- **Dolphin Mistral 7B** — serves Pro tier requests. ~4GB VRAM required, uncensored.

The model downloads once and caches in the browser. Subsequent starts are instant.

## Native workers

Native workers run on your machine using [node-llama-cpp](https://github.com/withcatai/node-llama-cpp), which supports CUDA (NVIDIA), Metal (Apple Silicon), and Vulkan (AMD/Intel) acceleration.

Native workers run **Qwen2.5 14B abliterated** and serve Max tier requests exclusively. They require a GPU with 10GB+ VRAM and deliver 30-100+ tokens per second depending on hardware.

## Job routing

| Tier | Worker type | Model |
|------|-------------|-------|
| Free | Browser (WebGPU) | Qwen 1.5B |
| Pro | Browser (WebGPU) | Dolphin Mistral 7B |
| Max | Native (node-llama-cpp) | Qwen2.5 14B abliterated |

## Web search (Max tier only)

When a Max tier user sends a message, the orchestrator can run a web search using the Brave Search API. It takes the top results, fetches their page content, and injects a summarized context into the prompt before sending it to the worker. The model then responds with information grounded in real, up-to-date web content and cites its sources.

## Token streaming

Responses stream in real-time. As the worker generates each token, it's sent through the orchestrator to the user immediately. There's no waiting for the full response — you see it being written live, just like any other chat AI, except the compute is happening on someone's GPU across the network.

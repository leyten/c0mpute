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
- **Worker selection** — picking which idle worker gets the job (weighted-random by measured tokens/sec)
- **Tool calls** — running web searches when a model requests one, and feeding the results back
- **Stats** — broadcasting real-time network statistics every 5 seconds

The orchestrator does not store conversations. It routes traffic and moves on.

## Browser workers

Browser workers run LLMs directly in your browser tab using [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) through the WebLLM library. No installation required — just open the page and click start.

Browser workers run **Qwen3 8B Uncensored** to serve Pro tier requests. ~4.3GB download, ~6GB VRAM required, uncensored.

The model downloads once and caches in the browser. Subsequent starts are instant.

## Native workers

Native workers run on your machine using [ollama](https://ollama.com), which supports CUDA (NVIDIA), Metal (Apple Silicon), and Vulkan (AMD/Intel) acceleration.

Native workers serve Max tier requests exclusively. Max is a multi-model tier — workers serve **Qwen3.5 27B** and **SuperGemma4 26B**, both uncensored, and the user picks which one from the chat model picker (a Devstral "code" model is also available via the API/CLI). They require a high-VRAM GPU (20GB+ recommended, e.g. RTX 3090/4090) and deliver 30+ tokens per second depending on hardware.

## Image workers

Image workers are a third worker type: independent GPUs running [ComfyUI](https://github.com/comfyanonymous/ComfyUI) for image generation. Image generation is exposed as a `generate_image` tool on the Max tier — the model calls it when an image is requested, and the image worker renders the result.

## Job routing

| Tier | Worker type | Model |
|------|-------------|-------|
| Pro | Browser (WebGPU) | Qwen3 8B Uncensored |
| Max | Native (ollama) | Qwen3.5 27B or SuperGemma4 26B (+ Devstral "code" via API/CLI) |

## Worker selection

When a job is ready, the orchestrator looks at the idle workers that serve the requested model and picks one by **weighted-random choice**. Each worker's weight is its measured average tokens/sec (with a floor so the slowest workers still get some traffic). Faster workers get more jobs, but work and earnings spread across the whole pool instead of always landing on the single fastest worker.

## Web search (Max tier only)

Web search is model-driven. The model itself decides whether to call the `web_search` tool. When it does, the orchestrator runs the search (Brave Search API), feeds the results back to the model as a tool result, and the model continues from there — a round trip, not a pre-fetch. The model then responds with information grounded in real, up-to-date web content and cites its sources.

## Token streaming

Responses stream in real-time. As the worker generates each token, it's sent through the orchestrator to the user immediately. There's no waiting for the full response — you see it being written live, just like any other chat AI, except the compute is happening on someone's GPU across the network.

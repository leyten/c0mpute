---
sidebar_position: 4
title: Architecture
---

# Architecture

Compute Network has three components: the **user client**, the **orchestrator**, and **workers**.

## User client

The web interface at c0mpute.ai. Users authenticate via Privy and send messages — there is one text model, so there is nothing to select. The client connects to the orchestrator via Socket.io and receives streamed token responses in real-time.

## Orchestrator

The central routing layer. A Node.js server using Socket.io that coordinates everything:

- **Authentication** — validates user sessions and worker tokens via Privy
- **Job queue** — receives user requests, queues them per model, and matches them to available workers
- **Worker registry** — tracks all connected workers: type (browser/native/image), model, status (idle/busy), performance stats
- **Model routing** — directs jobs to the correct worker type:
  - `qwen3.8-27b-uncensored` (chat and API) → native workers
  - `c0mpute-pro` and free prompts → browser workers running Qwen3 8B Uncensored
  - image jobs → image workers
- **Worker selection** — among the eligible idle workers serving the requested model, picks one by weighted-random choice (weight = measured tokens/sec), spreading earnings while favoring speed
- **Tool calls** — when a model requests the `web_search` tool, runs the Brave Search API query, fetches and extracts content from the top 3 results, and returns it to the model as a tool result
- **Stats broadcast** — pushes real-time network stats (active workers, queue depth, jobs completed) to all connected clients every 5 seconds

The orchestrator does **not** store conversations or prompt content. It routes traffic and discards it.

## Workers

### Browser workers (WebGPU)

Run in a browser tab using WebLLM, which leverages WebGPU for GPU-accelerated inference:

- **Qwen3 8B Uncensored** (~4.3GB) — serves the browser lane: `c0mpute-pro` requests and free prompts

Models download once and cache in the browser. Workers connect to the orchestrator via Socket.io, receive job assignments, run inference, and stream tokens back.

### Native workers (ollama)

Run as a Node.js process that drives a local ollama instance for inference with hardware acceleration:

- **CUDA** — NVIDIA GPUs
- **Metal** — Apple Silicon
- **Vulkan** — AMD and Intel GPUs

Native workers serve the network's text model, **Qwen3.8 27B Uncensored** (`qwen3.8-27b-uncensored`) — every worker runs the same build, auto-selected for its hardware (GGUF on NVIDIA/AMD, MLX on Apple Silicon). They authenticate with a worker token and connect to the orchestrator via Socket.io.

### Image workers (ComfyUI)

Run [ComfyUI](https://github.com/comfyanonymous/ComfyUI) on an independent GPU and serve image jobs — both the `generate_image` tool the text model can call and the [image API](/image-generation). They authenticate with a worker token and connect to the orchestrator via Socket.io.

## Job lifecycle

```
1. User sends message
2. Orchestrator receives request, determines which model it needs
3. Request enters that model's queue
4. Orchestrator matches request to an idle worker of the correct type — among the eligible idle workers, selection is weighted-random by each worker's measured tokens/sec (spreads earnings while favoring speed)
5. Job assigned to worker
6. Worker runs inference, streams tokens back to orchestrator
7. Orchestrator relays tokens to user in real-time
8. Job completes, worker marked idle, earnings credited
```

## Search flow

Web search is a model-driven tool call, not a pre-fetch. The model decides when to search:

```
1. User sends message
2. Worker runs the model; the model emits a web_search tool call
3. Orchestrator runs the Brave Search API query
4. Orchestrator fetches top 3 page URLs and extracts content
5. Results returned to the model as a tool result
6. Model continues generating, now grounded in web content
7. Response streams back with source citations
```

## Stats

The orchestrator broadcasts network stats to all connected clients every 5 seconds:

- Number of active workers (by type and model)
- Current queue depth per model
- Total jobs completed
- Network-wide tokens per second

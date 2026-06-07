---
sidebar_position: 4
title: Architecture
---

# Architecture

c0mpute has three components: the **user client**, the **orchestrator**, and **workers**.

## User client

The web interface at c0mpute.ai. Users authenticate via Privy, select a tier, and send messages. The client connects to the orchestrator via Socket.io and receives streamed token responses in real-time.

## Orchestrator

The central routing layer. A Node.js server using Socket.io that coordinates everything:

- **Authentication** — validates user sessions and worker tokens via Privy
- **Job queue** — receives user requests, queues them by tier, and matches them to available workers
- **Worker registry** — tracks all connected workers: type (browser/native), model, status (idle/busy), performance stats
- **Tier routing** — directs jobs to the correct worker type:
  - Pro → browser workers running Qwen3 8B Uncensored
  - Max → native workers running Qwen3.5 27B abliterated
- **Search** — for Max tier, runs Brave Search API queries, fetches and extracts content from the top 3 results, and injects summarized context into the prompt
- **Stats broadcast** — pushes real-time network stats (active workers, queue depth, jobs completed) to all connected clients every 5 seconds

The orchestrator does **not** store conversations or prompt content. It routes traffic and discards it.

## Workers

### Browser workers (WebGPU)

Run in a browser tab using WebLLM, which leverages WebGPU for GPU-accelerated inference:

- **Qwen3 8B Uncensored** (~4.3GB) — serves Pro tier

Models download once and cache in the browser. Workers connect to the orchestrator via Socket.io, receive job assignments, run inference, and stream tokens back.

### Native workers (ollama)

Run as a Node.js process that drives a local ollama instance for inference with hardware acceleration:

- **CUDA** — NVIDIA GPUs
- **Metal** — Apple Silicon
- **Vulkan** — AMD and Intel GPUs

Native workers exclusively run **Qwen3.5 27B abliterated** and serve Max tier requests. They authenticate with a worker token and connect to the orchestrator via Socket.io.

## Job lifecycle

```
1. User sends message
2. Orchestrator receives request, determines tier
3. Request enters tier-specific queue
4. Orchestrator matches request to an idle worker of the correct type
5. Job assigned to worker
6. Worker runs inference, streams tokens back to orchestrator
7. Orchestrator relays tokens to user in real-time
8. Job completes, worker marked idle, earnings credited
```

## Search flow (Max tier)

```
1. User sends message (Max tier)
2. Orchestrator extracts search query from the message
3. Brave Search API returns top results
4. Orchestrator fetches top 3 page URLs and extracts content
5. Summarized search context injected into the prompt
6. Enriched prompt sent to native worker
7. Worker generates response grounded in web content
8. Response streams back with source citations
```

## Stats

The orchestrator broadcasts network stats to all connected clients every 5 seconds:

- Number of active workers (by type and model)
- Current queue depth per tier
- Total jobs completed
- Network-wide tokens per second

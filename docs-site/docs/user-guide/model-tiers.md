---
sidebar_position: 2
title: Model tiers
---

# Model tiers

c0mpute offers three tiers, each running a different model on different infrastructure.

## Free — Qwen3 1.7B

- **Cost:** 0 credits per message
- Runs in **browser workers** via WebGPU
- ~1GB model download, ~2GB VRAM
- Fast responses, low VRAM requirements
- Standard model with default safety filters
- Good for: simple questions, quick lookups, casual use

This is the default tier. It works on most modern devices with WebGPU support. No $ZERO needed.

## Pro — Qwen3 8B Uncensored

- **Cost:** 10 credits per message
- Runs in **browser workers** via WebGPU
- ~4.3GB model download, ~6GB VRAM required
- **Uncensored** — won't refuse topics based on corporate content policies
- Higher quality reasoning and longer, more detailed responses

Pro uses a custom abliterated build of Qwen3 8B, with refusal behavior removed. It answers what you ask without moralizing or deflecting.

## Max — Qwen3.5 27B abliterated

- **Cost:** 50 credits per message
- Runs on **native workers** via ollama
- High-VRAM GPU required on the worker's machine (20GB+ recommended, e.g. RTX 3090/4090)
- **Uncensored** — abliterated (refusal behavior surgically removed)
- **Web search** — can search the internet and cite sources
- **Vision** — accepts image input
- **Thinking mode** — extended reasoning before answering
- Best quality responses across all tiers

Max is the premium tier. It runs on dedicated native workers with powerful GPUs, delivering the highest quality responses in the network.

## Credit costs at a glance

| Tier | Credits/msg | $ZERO needed |
|------|-------------|-------------|
| Free | 0 | None |
| Pro | 10 | 10 $ZERO per message |
| Max | 50 | 50 $ZERO per message |

Credits are deducted when you send a message. If a job fails or you disconnect, credits are refunded automatically.

## What "uncensored" means

Corporate AI models (ChatGPT, Claude, Gemini) are trained to refuse certain topics. Ask about anything the company considers sensitive and you get a refusal. These aren't safety features — they're content policies imposed by corporations.

Uncensored models like the abliterated Qwen builds c0mpute runs have had this refusal training removed. They answer your questions directly without corporate-imposed restrictions.

## Web search (Max only)

When you use Max tier, the orchestrator runs a web search using the Brave Search API before sending your prompt to the worker. It fetches the top results, extracts relevant content, and includes it as context. The model generates a response grounded in current web data and cites its sources.

This means Max tier can answer questions about recent events, look up current information, and provide sourced responses — something no browser-based tier can do.

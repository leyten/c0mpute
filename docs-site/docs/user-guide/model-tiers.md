---
sidebar_position: 2
title: Model tiers
---

# Model tiers

c0mpute offers two tiers running on different infrastructure. Pro is a single model; Max is a family of models.

## Pro — Qwen3 8B Uncensored

- **Cost:** 10 credits per message
- Runs in **browser workers** via WebGPU
- ~4.3GB model download, ~6GB VRAM required
- **Uncensored** — won't refuse topics based on corporate content policies
- Higher quality reasoning and longer, more detailed responses

Pro uses a custom abliterated build of Qwen3 8B, with refusal behavior removed. It answers what you ask without moralizing or deflecting. This is the default tier.

## Max — multi-model tier

- **Cost:** 15 credits per message (20 with deep thinking, where supported)
- Runs on **native workers** via ollama
- High-VRAM GPU required on the worker's machine (20GB+ recommended, e.g. RTX 3090/4090)
- **Uncensored** — refusal behavior removed
- Best quality responses across all tiers

Max is the premium tier. It runs on dedicated native workers with powerful GPUs, delivering the highest quality responses in the network. It is a family of models:

- **Qwen3.5 27B abliterated** — the default Max model in the chat model picker. Abliterated (refusal behavior surgically removed). Supports web search, vision, and thinking mode.
- **SuperGemma4 26B** — also in the chat model picker. Uncensored MoE, supports tools and deep-thinking.
- **Devstral 24B** (the `code` model) — available via the API/CLI (model id `code`), not in the chat picker. It powers c0mpute code, the agentic coding agent. See the dedicated [c0mpute code](/c0mpute-code) doc.

## Credit costs at a glance

| Tier | Credits/msg | USD cost |
|------|-------------|----------|
| Pro | 10 | $0.10 per message |
| Max | 15 (20 w/ deep thinking) | $0.15 per message ($0.20 w/ deep thinking) |

Credits are priced at $0.01 each and bought with USDC.

Credits are deducted when you send a message. If a job fails or you disconnect, credits are refunded automatically.

## What "uncensored" means

Corporate AI models (ChatGPT, Claude, Gemini) are trained to refuse certain topics. Ask about anything the company considers sensitive and you get a refusal. These aren't safety features — they're content policies imposed by corporations.

Uncensored models like the abliterated Qwen builds c0mpute runs have had this refusal training removed. They answer your questions directly without corporate-imposed restrictions.

## Web search (Max only)

When you use Max tier, the orchestrator runs a web search using the Brave Search API before sending your prompt to the worker. It fetches the top results, extracts relevant content, and includes it as context. The model generates a response grounded in current web data and cites its sources.

This means Max tier can answer questions about recent events, look up current information, and provide sourced responses — something no browser-based tier can do.

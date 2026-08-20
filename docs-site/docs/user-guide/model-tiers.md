---
sidebar_position: 2
title: Models
---

# Models

There are no tiers. c0mpute serves **one text model** to everyone, plus a browser-powered small model and a swarm model on the API, and a separate image model. All of them are uncensored.

## Qwen3.8 27B Uncensored

- **Cost:** 15 credits per message (20 with thinking)
- **Model ids:** `qwen3.8-27b-uncensored`, `qwen3.8-27b-uncensored-think`
- Runs on **native workers** via ollama — consumer GPUs, not a data center
- **Uncensored** — refusal behavior removed

This is what chat uses, and what [c0mpute code](/c0mpute-code) runs on. There is nothing to select: every message goes to the same model, and every native worker on the network runs the same build.

What it can do:

- **Web search and tools** — the model decides when to search, calls the tool, and answers grounded in the results with citations. Through the API you can hand it your own functions the same way.
- **Vision** — send it an image and it reads it. (Image *input*. Making pictures is the image model below.)
- **Thinking mode** — extended chain-of-thought before it answers, for harder problems. 20 credits instead of 15.

## c0mpute-pro

- **Cost:** 10 credits per message
- **Model id:** `c0mpute-pro`
- Uncensored **Qwen3 8B**, run by **browser workers** on WebGPU — ~4.3GB download, ~6GB VRAM

The browser lane: a small, fast model on the widest supply in the network. It also serves free prompts. It can attempt tool calls but is less consistent at them than the 27B, so for agents use `qwen3.8-27b-uncensored`.

## c0mpute-swarm

- **Cost:** 10 credits per message
- **Model id:** `c0mpute-swarm`
- **MiniMax-M2.5 (229B)**, split across a swarm of contributor GPUs — no single machine holds the whole model

A 229B model running on hardware that could never hold it alone. Availability depends on a swarm ring being assembled and ready, so check the `available` flag from `GET /v1/models` before you depend on it.

## Image generation

- **Cost:** 20 credits per image
- **Chroma1-HD** on dedicated image workers, uncensored

Available both as a tool the text model calls when you ask it for a picture, and as a direct endpoint. See [Image generation](/image-generation).

## Credit costs at a glance

| What | Credits | USD |
|------|---------|-----|
| Message on `qwen3.8-27b-uncensored` | 15 | $0.15 |
| …with thinking | 20 | $0.20 |
| Message on `c0mpute-pro` | 10 | $0.10 |
| Message on `c0mpute-swarm` | 10 | $0.10 |
| Image | 20 | $0.20 |

Credits are priced at $0.01 each and bought with USDC.

Credits are deducted when you send a message. If a job fails or you disconnect, credits are refunded automatically.

## What "uncensored" means

Corporate AI models (ChatGPT, Claude, Gemini) are trained to refuse certain topics. Ask about anything the company considers sensitive and you get a refusal. These aren't safety features — they're content policies imposed by corporations.

The uncensored builds c0mpute runs have had this refusal training removed. They answer your questions directly without corporate-imposed restrictions.

## Web search

Web search is model-driven. The model itself decides whether a question needs current information; when it does, the orchestrator runs the search (Brave Search API), extracts content from the top results, and hands it back to the model as a tool result. The model then answers grounded in real, up-to-date web content and cites its sources.

That means it can answer questions about recent events and look things up, instead of guessing from training data.

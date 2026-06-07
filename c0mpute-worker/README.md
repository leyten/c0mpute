# c0mpute-worker

Native CLI worker for the [c0mpute.ai](https://c0mpute.ai) distributed inference network. Runs LLM inference via [ollama](https://ollama.com) and connects to the orchestrator via Socket.io.

## Quick Start

1. Install [ollama](https://ollama.com/download)
2. Run the worker:

```bash
npx @c0mpute/worker --token <your-token>
```

The worker manages ollama for you — no need to start it yourself. On first run it will automatically:
- Start ollama (on NVIDIA GPUs, with flash-attention + q8 KV cache for ~36% more speed and a larger context window)
- Pull the base model (~17GB download)
- Create a custom `c0mpute-max` model tuned to your hardware (context window auto-scales to your VRAM)
- Run a speed benchmark
- Connect to the orchestrator and start serving jobs

## How It Works

1. Starts/configures ollama (flash-attention + q8 KV on NVIDIA)
2. Pulls and configures the model (Qwen 3.5 27B abliterated), with a VRAM-adaptive context window (24GB → 32K, 48GB+ → 64K, smaller cards stay conservative)
3. Runs a speed benchmark to measure your hardware
4. Connects to the c0mpute.ai orchestrator via WebSocket
5. Accepts and processes inference jobs, streaming tokens back in real time

> Already supervise ollama yourself (e.g. systemd/pm2 with your own flags)? Set `C0MPUTE_MANAGE_OLLAMA=0` and the worker will use your running instance instead of restarting it.

## Capabilities

- **Thinking** — model uses chain-of-thought reasoning with `<think>` tags
- **Vision** — accepts images (base64) alongside text messages
- **Tool calling** — model can invoke tools (web search, etc.) defined by the orchestrator
- **Uncensored** — abliterated model with no content restrictions
- **Long context** — 256K context window

## Options

```
--token <token>   Authentication token from c0mpute.ai (required)
--url <url>       Orchestrator URL (default: https://c0mpute.ai)
--benchmark       Run benchmark only, then exit
--version         Show version
--help            Show help
```

## Requirements

- Node.js 18+
- [ollama](https://ollama.com) installed and running
- GPU with 20GB+ VRAM recommended (NVIDIA RTX 3090/4090, Apple Silicon 32GB+)
- ~17GB disk space for the model

## Default Model

[Qwen 3.5 27B Abliterated](https://ollama.com/huihui_ai/qwen3.5-abliterated:27b) — an uncensored 27B parameter model with 256K context window, vision support, and thinking capabilities.

## Architecture

The worker delegates all inference to ollama's local HTTP API. This means:
- **No CUDA/Metal build issues** — ollama handles GPU acceleration
- **Easy model management** — ollama pulls and caches models
- **Automatic GPU detection** — ollama picks the best backend for your hardware

The worker is a dumb relay — it passes tool definitions to the model and relays tool calls back to the orchestrator for execution. Tools are defined and managed server-side.

## Earnings

Workers earn credits for completing inference jobs. Earnings are based on tokens generated and your hardware tier. Check your earnings at [c0mpute.ai](https://c0mpute.ai).

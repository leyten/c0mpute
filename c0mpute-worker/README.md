# c0mpute-worker

Native CLI worker for the [c0mpute.ai](https://c0mpute.ai) distributed inference network. Connects to the orchestrator over Socket.io and serves jobs from your GPU. A worker runs in **one of two modes** — text or image — chosen on first run:

- **Max (text)** — LLM inference via [ollama](https://ollama.com) (Qwen 3.5 27B abliterated).
- **Image** — text-to-image via [ComfyUI](https://github.com/comfyanonymous/ComfyUI) + the uncensored Chroma1-HD model.

## Quick Start

```bash
npx @c0mpute/worker --token <your-token>
```

On first run it asks which mode to run (Max or Image) and remembers your choice. Skip the prompt with `--mode`:

```bash
npx @c0mpute/worker --token <your-token> --mode max     # text worker
npx @c0mpute/worker --token <your-token> --mode image   # image worker
```

Get a token at [c0mpute.ai/worker](https://c0mpute.ai/worker). Only the chosen mode's model is downloaded — never both.

## Max (text) worker

Runs Qwen 3.5 27B abliterated via ollama. On first run it automatically starts/configures ollama (flash-attention + q8 KV cache on NVIDIA for ~36% more speed), pulls the model (~17GB), tunes a VRAM-adaptive context window (24GB → 32K, 48GB+ → 64K), runs a speed benchmark, and serves jobs (streaming, vision, tool calling, thinking).

> Supervise ollama yourself? Set `C0MPUTE_MANAGE_OLLAMA=0` to use your running instance.

**Requirements:** Node 18+, [ollama](https://ollama.com), 20GB+ VRAM (RTX 3090/4090, Apple Silicon 32GB+), ~17GB disk.

## Image worker

Runs the uncensored **Chroma1-HD** model on [ComfyUI](https://github.com/comfyanonymous/ComfyUI) and renders the jobs the orchestrator dispatches. The worker is a thin relay: the orchestrator sends the full workflow (model + tuned defaults), so every worker produces identical output and the recipe can change without you updating anything.

On startup it:
1. Checks ComfyUI is reachable (`COMFY_URL`, default `http://127.0.0.1:8188`) and starts it if `COMFY_DIR` is set.
2. Downloads the Chroma model files (~14GB, first run only) if they're missing.
3. Runs a **render self-check** — a quick 512×512 test image — and only registers if it succeeds, so a broken setup never accepts jobs.
4. Serves render jobs and earns per image.

**Requirements:** Node 18+, [ComfyUI](https://github.com/comfyanonymous/ComfyUI) (point `COMFY_URL` at it, or set `COMFY_DIR` so the worker can launch it), a 24GB GPU (RTX 3090/4090) recommended, ~14GB disk for the model.

**Env:** `COMFY_URL` (ComfyUI endpoint), `COMFY_DIR` (ComfyUI folder, lets the worker install/launch it + place models).

## Options

```
--token <token>   Authentication token from c0mpute.ai (required)
--mode <mode>     "max" (text) or "image". Prompts on first run if omitted.
--url <url>       Orchestrator URL (default: https://c0mpute.ai)
--benchmark       Run benchmark only, then exit (Max mode)
--version         Show version
--help            Show help
```

## Earnings

Workers earn credits for completing jobs — text jobs by tier and tokens generated, image jobs per render. Check your earnings at [c0mpute.ai](https://c0mpute.ai).

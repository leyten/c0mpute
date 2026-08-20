# @compute-network/worker

Native CLI worker for the [Compute Network](https://compute.tech) distributed inference network. Connects to the orchestrator over Socket.io and serves jobs from your GPU. A worker runs in **one of two modes** — text or image — chosen on first run:

- **Qwen (text)** — LLM inference via [ollama](https://ollama.com): **Qwen3.8 27B Uncensored**, the network's single public model (tools, vision, thinking).
- **Image** — text-to-image via [ComfyUI](https://github.com/comfyanonymous/ComfyUI) + the uncensored Chroma1-HD model.

## Quick Start

```bash
npx @compute-network/worker --token <your-token>
```

It asks which mode to run (text or image) on every interactive start, defaulting to your last choice — just press Enter to keep it, or pick the other to switch. Skip the prompt entirely with `--mode`:

```bash
npx @compute-network/worker --token <your-token> --mode max     # Qwen text worker
npx @compute-network/worker --token <your-token> --mode image   # image worker
```

Get a token at [compute.tech/earn](https://compute.tech/earn). Only the chosen mode is downloaded — never both. A rig with more than one NVIDIA card needs no extra flags: it runs one worker per capable GPU on its own (see [Multi-GPU rigs](#multi-gpu-rigs)).

## Qwen (text) worker

Serves **Qwen3.8 27B Uncensored** (`qwen3.8-27b-uncensored`) — there is no model picker; every text worker on the network runs the same model. On first run it automatically installs ollama if it's missing (winget on Windows, Homebrew on macOS, the official script on Linux), starts/configures it (flash-attention + q8 KV cache on NVIDIA), downloads the build that fits your hardware, runs a speed benchmark, and serves jobs (streaming, tool calling, vision, thinking).

The build is picked from your hardware, once, automatically:

| Hardware | Build | Speculative decoding |
| --- | --- | --- |
| NVIDIA 24GB+ (3090/4090/5090…) | GGUF Q4_K_M + vision projector | on (in-model MTP, lossless, up to ~2.4x) |
| NVIDIA 16GB (4080/5060 Ti 16GB…) | GGUF IQ4_XS + vision projector | on |
| Multiple small NVIDIA cards (no single card fits) | GGUF noMTP-IQ4_XS, layer-split across cards | off |
| AMD 24GB+ | GGUF Q4_K_M | off |
| Apple Silicon, 32GB+ unified memory | MLX 4-bit via ollama's MLX engine | off (never on Metal) |

The context window is VRAM-adaptive and baked into the local model; the worker reports it at registration. Weights download once (kept under `~/.config/compute-worker/models` on the GGUF path (a pre-rename rig keeps its existing download dir), so config updates rebuild without re-downloading), resume if interrupted, and are fetched from a pinned revision and sha256-verified before use — every worker serves byte-identical weights.

**Ollama v0.32.15 or newer is required** — older versions can't load this model (they fail with unhelpful HTTP 500s, and some 0.32.x CUDA builds silently run RTX 30xx cards on CPU). The worker checks at startup and tells you in plain words if you need to upgrade.

> Supervise ollama yourself? Set `C0MPUTE_MANAGE_OLLAMA=0` to use your running instance.

**Requirements:** Node 18+, [ollama](https://ollama.com) v0.32.15+, and one of: a 16GB+ NVIDIA GPU (24GB recommended), a 24GB+ AMD GPU, or an Apple Silicon Mac with 32GB+ unified memory. ~40GB free disk (the downloaded weights are kept for cheap rebuilds, and ollama stores its own copy; a mixed-VRAM rig that needs two builds uses more).

## Multi-GPU rigs

Ollama loads a model that fits on a **single** card, so one worker only ever drives one GPU — on an 8-GPU box seven cards would sit idle. So the CLI counts the NVIDIA cards itself and, when there's more than one with enough VRAM to hold the model (16GB+), runs **one worker per capable GPU**. No flags:

```bash
npx @compute-network/worker --token <your-token> --mode max
# 8 GPUs detected — starting one worker per GPU (use --gpu <n> to run a single card).
```

Cards under the 16GB floor are skipped (and logged). If **no** card can hold the model alone but the rig's combined VRAM can (e.g. 2×12GB), the CLI runs a **single** worker instead and lets ollama split the layers across the cards, using a build without the MTP head (which would slow split loads).

The mode is prompted once, then the process becomes a supervisor and re-execs itself per card. Each child gets `CUDA_VISIBLE_DEVICES=<n>` and its own ollama on port `11434 + n`, so the cards never fight over one daemon and VRAM detection sizes each worker against the card it actually runs on. A single-GPU or non-NVIDIA box is untouched — it takes exactly the single-daemon path it always has.

Run a chosen card, or a chosen set, with `--gpu` (indexes as `nvidia-smi` numbers them, 0-15):

```bash
npx @compute-network/worker --token <your-token> --mode max --gpu 3      # only GPU 3
npx @compute-network/worker --token <your-token> --mode max --gpu 0,2,5  # only these three
```

**Stop any system ollama first.** GPU 0's worker owns port 11434 — ollama's own default. A pinned worker never restarts a daemon that already serves its port (every `ollama serve` looks alike to `pkill`, so killing it would take the siblings down too), which means a pre-existing box-wide ollama gets adopted as-is — and that daemon sees *every* card instead of just GPU 0:

```bash
pkill -f "ollama serve"          # macOS/Linux
taskkill /F /IM ollama.exe       # Windows
```

Every per-GPU daemon shares one model store (`~/.ollama`) and one download directory, so GPU 0 starts alone (`Starting GPU 0 first; the others follow once the model is on disk (first run only).`) and the rest follow once the model is built and resident — simultaneous first-run downloads of the same file would corrupt each other. Subsequent starts don't wait.

Child output is prefixed with its card, so one terminal stays readable:

```
[gpu 0] Ollama: connected
[gpu 3] Benchmark: 104.2 tok/s
[gpu 5] worker exited (code 1) — restarting in 30s
```

A child that dies is respawned on a fixed 30s backoff, so a wedged card can't crash-loop the rig or spam registrations; Ctrl-C or `systemctl stop` stops the supervisor and every child. `--benchmark` stays a one-shot diagnostic — it measures the box once and exits rather than fanning out into per-card children (with `--gpu 0,2,5` it measures the first index given).

**Cap:** the network accepts at most **10 workers per IP** (and 10 per account), so on a rig with more cards than that the extra workers are refused at registration.

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
-V, --version    output the version number
--token <token>  Authentication token from compute.tech
--url <url>      Orchestrator URL (default: "https://c0mpute.ai")
--mode <mode>    Worker mode: "max" (text/LLM) or "image" (image gen).
                 Prompts on first run if omitted.
--model <model>  Deprecated: the network runs a single model; ignored.
--gpu <indexes>  Text mode: run only these GPUs — one index (--gpu 3) or a
                 comma list (--gpu 0,2,5). Omitted, a multi-GPU rig runs
                 every capable card, one worker each.
--benchmark      Run benchmark only, then exit
-h, --help       display help for command
```

`--token` is required. One subcommand: `compute-worker reset` clears the saved mode so the next start re-prompts.

## Updating

There is **no auto-update** — a worker runs exactly the version you installed and nothing self-upgrades at startup (a hijacked release re-exec'ing itself on every worker is not a surface worth having). Upgrades are explicit:

```bash
npm i -g @compute-network/worker@latest                       # global install
npx -y @compute-network/worker@latest --token <your-token>    # npx: @latest fetches the current release
```

Every start prints the version it's running (`Compute Network worker v…`), so you can always see what a box is on.

## Earnings

Workers earn credits for completing jobs — text jobs by tokens generated, image jobs per render. Check your earnings at [Compute Network](https://compute.tech).

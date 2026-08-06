# c0mpute-worker

Native CLI worker for the [c0mpute.ai](https://c0mpute.ai) distributed inference network. Connects to the orchestrator over Socket.io and serves jobs from your GPU. A worker runs in **one of two modes** — text or image — chosen on first run:

- **Max (text)** — LLM inference via [ollama](https://ollama.com). Pick a model: **Qwen3.5 27B** or **SuperGemma4 26B** (both uncensored).
- **Image** — text-to-image via [ComfyUI](https://github.com/comfyanonymous/ComfyUI) + the uncensored Chroma1-HD model.

## Quick Start

```bash
npx @c0mpute/worker --token <your-token>
```

It asks which mode to run (Max or Image) on every interactive start, defaulting to your last choice — just press Enter to keep it, or pick the other to switch. Skip the prompt entirely with `--mode`:

```bash
npx @c0mpute/worker --token <your-token> --mode max     # text worker
npx @c0mpute/worker --token <your-token> --mode image   # image worker
```

For a Max worker it then asks which model to run (again every interactive start, defaulting to your last choice) and shows how many workers are live on each, recommending the one with the fewest (so new supply balances the network). Skip that prompt with `--model`:

```bash
npx @c0mpute/worker --token <your-token> --mode max --model qwen        # Qwen3.5 27B
npx @c0mpute/worker --token <your-token> --mode max --model supergemma  # SuperGemma4 26B
```

Get a token at [c0mpute.ai/earn](https://c0mpute.ai/earn). Only the chosen mode + model is downloaded — never more than one. A rig with more than one NVIDIA card needs no extra flags: it runs one worker per GPU on its own (see [Multi-GPU rigs](#multi-gpu-rigs)).

## Max (text) worker

Runs your chosen model via ollama: **Qwen3.5 27B** (tools, vision, thinking) or **SuperGemma4 26B** (MoE, newer, faster, tools — text only). On first run it automatically installs ollama if it's missing (winget on Windows, Homebrew on macOS, the official script on Linux), starts/configures it (flash-attention + q8 KV cache on NVIDIA for ~36% more speed), pulls the model (~17GB), tunes a VRAM-adaptive context window (24GB → 32K, 48GB+ → 64K), runs a speed benchmark, and serves jobs (streaming + tool calling, plus vision/thinking on models that support them). Every interactive start re-asks your model with the last one as default; press Enter to keep it or pass `--model` to set it directly.

> Supervise ollama yourself? Set `C0MPUTE_MANAGE_OLLAMA=0` to use your running instance.

**Requirements:** Node 18+, [ollama](https://ollama.com), 20GB+ VRAM (RTX 3090/4090, Apple Silicon 32GB+), ~17GB disk.

## Multi-GPU rigs

Ollama loads a model that fits on a **single** card, so one worker only ever drives one GPU — on an 8-GPU box seven cards would sit idle. So the CLI counts the NVIDIA cards itself and, when there's more than one, runs **one worker per GPU**. No flags:

```bash
npx @c0mpute/worker --token <your-token> --mode max
# 8 GPUs detected — starting one worker per GPU (use --gpu <n> to run a single card).
```

Mode and model are prompted once, then the process becomes a supervisor and re-execs itself per card. Each child gets `CUDA_VISIBLE_DEVICES=<n>` and its own ollama on port `11434 + n`, so the cards never fight over one daemon and VRAM detection sizes the context window against the card the child actually runs on. A single-GPU or non-NVIDIA box is untouched — it takes exactly the single-daemon path it always has.

Run a chosen card, or a chosen set, with `--gpu` (indexes as `nvidia-smi` numbers them, 0-15):

```bash
npx @c0mpute/worker --token <your-token> --mode max --gpu 3      # only GPU 3
npx @c0mpute/worker --token <your-token> --mode max --gpu 0,2,5  # only these three
```

**Stop any system ollama first.** GPU 0's worker owns port 11434 — ollama's own default. A pinned worker never restarts a daemon that already serves its port (every `ollama serve` looks alike to `pkill`, so killing it would take the siblings down too), which means a pre-existing box-wide ollama gets adopted as-is — and that daemon sees *every* card instead of just GPU 0:

```bash
pkill -f "ollama serve"          # macOS/Linux
taskkill /F /IM ollama.exe       # Windows
```

Every per-GPU daemon shares one model store (`~/.ollama`), and a pull has no cross-process lock — simultaneous first-run downloads of the same blob interleave into one partial file and fail the digest check. So GPU 0 starts alone (`Starting GPU 0 first; the others follow once the model is on disk (first run only).`) and the rest follow once the model is built and resident. Subsequent starts don't wait.

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
--token <token>  Authentication token from c0mpute.ai
--url <url>      Orchestrator URL (default: "https://c0mpute.ai")
--mode <mode>    Worker mode: "max" (text) or "image" (image gen). Prompts on
                 first run if omitted.
--model <model>  Max model to run: qwen | supergemma. Prompts on first run if
                 omitted.
--gpu <indexes>  Max mode: run only these GPUs — one index (--gpu 3) or a
                 comma list (--gpu 0,2,5). Omitted, a multi-GPU rig runs
                 every card, one worker each.
--benchmark      Run benchmark only, then exit
-h, --help       display help for command
```

`--token` is required. One subcommand: `c0mpute-worker reset` clears the saved mode/model so the next start re-prompts.

## Updating

There is **no auto-update** — a worker runs exactly the version you installed and nothing self-upgrades at startup (a hijacked release re-exec'ing itself on every worker is not a surface worth having). Upgrades are explicit:

```bash
npm i -g @c0mpute/worker@latest                       # global install
npx -y @c0mpute/worker@latest --token <your-token>    # npx: @latest fetches the current release
```

Every start prints the version it's running (`c0mpute worker v…`), so you can always see what a box is on.

## Earnings

Workers earn credits for completing jobs — text jobs by tier and tokens generated, image jobs per render. Check your earnings at [c0mpute.ai](https://c0mpute.ai).

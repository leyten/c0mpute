---
sidebar_position: 4
title: macOS
---

# macOS setup (Apple Silicon)

## Requirements

- **Apple Silicon** (M1, M2, M3, M4) — Intel Macs are **not supported** for the text worker
- **32GB+ unified memory** — 16GB and 24GB Macs are below the bar, they can't hold the model
- **Node.js 18+**
- **ollama v0.32.15 or newer** — the MLX build needs a current ollama

## Install Node.js

Using Homebrew:

```bash
brew install node
```

Or download from [nodejs.org](https://nodejs.org/).

## Install (or upgrade) ollama

The worker checks the ollama version at startup and stops if it's older than 0.32.15 — older builds return unhelpful HTTP 500s instead of loading the model:

```bash
brew upgrade ollama    # or: brew install ollama, or ollama.com/download
ollama --version
```

## Run the worker

```bash
npx @c0mpute/worker --token <your-token>
```

That's it. ollama automatically detects Metal on Apple Silicon — no extra drivers or configuration needed.

There is nothing to choose: every native worker serves the same model, `qwen3.8-27b-uncensored`. On a Mac you get the **MLX 4-bit build**, run through ollama's MLX engine (speculative decoding is never used on Metal). The old `--model` flag is deprecated and ignored; pass `--mode max` to skip the text/image question.

Get a token at [c0mpute.ai/earn](https://c0mpute.ai/earn).

On first run the model downloads (budget ~20GB of free disk) and a benchmark runs to verify performance.

## Expected performance

Indicative, not a promise — a loaded machine is slower:

| Chip | Expected tok/s |
|------|---------------|
| M3 Ultra | 38-40 |
| M3 Max | up to 36 |
| M4 Max | 20-30 |

## Tips

- **Close other apps** — the model shares unified memory with everything else. Safari with 50 tabs open means less RAM for inference.
- **Check Activity Monitor** — look at the GPU tab to verify the model is using GPU, not CPU
- **32GB is the floor** — a 16GB or 24GB Mac can't run the text worker. Run a [browser worker](/worker-guide/browser-worker) instead.
- **Keep it plugged in** — macOS may throttle GPU performance on battery

## Low performance?

If you're getting significantly fewer tok/s than expected:

1. Check free memory — close apps to free RAM
2. Make sure you're on Apple Silicon, not Rosetta
3. Run `node -p "process.arch"` — should say `arm64`, not `x64`
4. See [Troubleshooting](/worker-guide/native-worker/troubleshooting)

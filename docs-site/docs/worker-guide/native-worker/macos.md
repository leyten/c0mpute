---
sidebar_position: 4
title: macOS
---

# macOS setup (Apple Silicon)

## Requirements

- **Apple Silicon** (M1, M2, M3, M4) — Intel Macs are not recommended (no Metal acceleration, very slow)
- **32GB RAM minimum** — the model needs ~17GB
- **Node.js 18+**

## Install Node.js

Using Homebrew:

```bash
brew install node
```

Or download from [nodejs.org](https://nodejs.org/).

## Run the worker

```bash
npx @c0mpute/worker --token <your-token>
```

That's it. node-llama-cpp automatically detects Metal on Apple Silicon — no extra drivers or configuration needed.

On first run, the model downloads (~17GB) and a benchmark runs to verify performance.

## Expected performance

| Chip | Expected tok/s |
|------|---------------|
| M1 | 20-30 |
| M1 Pro/Max | 30-45 |
| M2 | 25-35 |
| M2 Pro/Max | 35-50 |
| M3 | 30-40 |
| M3 Pro/Max | 50-70 |
| M4 | 35-50 |
| M4 Pro/Max | 60-80+ |

## Tips

- **Close other apps** — the model shares unified memory with everything else. Safari with 50 tabs open means less RAM for inference.
- **Check Activity Monitor** — look at the GPU tab to verify the model is using GPU, not CPU
- **16GB M1 works** but you'll be tight on memory. 24GB+ is more comfortable.
- **Keep it plugged in** — macOS may throttle GPU performance on battery

## Low performance?

If you're getting significantly fewer tok/s than expected:

1. Check free memory — close apps to free RAM
2. Make sure you're on Apple Silicon, not Rosetta
3. Run `node -p "process.arch"` — should say `arm64`, not `x64`
4. See [Troubleshooting](/worker-guide/native-worker/troubleshooting)

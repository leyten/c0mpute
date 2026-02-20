# c0mpute-worker

Native CLI worker for the [c0mpute.ai](https://c0mpute.ai) distributed inference network. Runs LLM inference using node-llama-cpp with full GPU acceleration (CUDA, Metal, Vulkan) and connects to the orchestrator via Socket.io.

## Quick Start

```bash
npx c0mpute-worker --token <your-token>
```

## What It Does

1. Detects your GPU (CUDA, Metal, Vulkan, or CPU fallback)
2. Downloads the optimal GGUF model for your hardware (~8GB)
3. Runs a speed benchmark
4. Connects to the c0mpute.ai orchestrator
5. Accepts and processes inference jobs, streaming tokens back in real time

## Options

```
--token <token>   Authentication token from c0mpute.ai (required)
--url <url>       Orchestrator URL (default: https://c0mpute.ai)
--model <path>    Path to a custom GGUF model file
--benchmark       Run benchmark only, then exit
--version         Show version
--help            Show help
```

## Requirements

- Node.js 18+
- 10GB+ disk space for model download
- GPU with 10GB+ VRAM recommended (NVIDIA, Apple Silicon, or Vulkan-compatible)
- CPU-only mode available but slower

## Default Model

Qwen2.5-14B-Instruct (Q4_K_M quantization) from [bartowski/Qwen2.5-14B-Instruct-GGUF](https://huggingface.co/bartowski/Qwen2.5-14B-Instruct-GGUF).

Models are stored in `~/.c0mpute/models/`.

## License

MIT

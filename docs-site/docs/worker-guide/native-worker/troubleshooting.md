---
sidebar_position: 5
title: Troubleshooting
---

# Troubleshooting

## "Your device is too slow (X tok/s). Minimum required: 5 tok/s."

Your GPU is not being used. ollama is running on CPU, which is too slow for the network.

**NVIDIA (Linux/Windows):**
```bash
# Both of these should work:
nvcc --version
nvidia-smi
```
If either fails, install the CUDA toolkit. On Ubuntu: `sudo apt install nvidia-cuda-toolkit`. On Windows, download from [developer.nvidia.com](https://developer.nvidia.com/cuda-downloads).

**AMD (Linux/Windows):**
Vulkan should be auto-detected. If not, install Vulkan drivers:
```bash
# Ubuntu
sudo apt install mesa-vulkan-drivers
# Verify
vulkaninfo | head
```

**Apple Silicon:**
Metal auto-detects on Apple Silicon. If performance is unexpectedly low:
- Check Activity Monitor → GPU tab for GPU usage
- Make sure you're running native arm64 Node.js: `node -p "process.arch"` should output `arm64`
- Free up RAM — close other apps

## "Connection error: Invalid authentication token"

- Your worker token may be expired or invalid
- Generate a new one from [c0mpute.ai/earn](https://c0mpute.ai/earn) → Native Worker → Get Worker Token
- Make sure you're logged in to the same account that generated the token
- Tokens start with `cwt_` — make sure you copied the full string

## Model download fails

The model (~17GB) is pulled via ollama on first run.

- **Check disk space**: you need ~17GB free where ollama stores models (`~/.ollama` by default)
- **Check internet**: try `curl -I https://huggingface.co` to verify connectivity
- **Retry**: HuggingFace occasionally has temporary issues. Just run the command again.
- **Behind a proxy?** Set `HTTPS_PROXY` environment variable

## Worker disconnects frequently

- Check your internet stability — packet loss or high latency causes disconnects
- The worker auto-reconnects after a disconnect, but you lose any in-progress jobs
- If using WiFi, try a wired connection
- Check if your firewall is blocking WebSocket connections

## Low tok/s on Windows

This is the most common issue. Native Windows CUDA support is flaky with ollama.

**Solution: use WSL.**

1. Install WSL2: `wsl --install`
2. Install Node.js and CUDA toolkit **inside WSL**
3. Run the worker from WSL terminal

See the [Windows setup guide](/worker-guide/native-worker/windows) for full instructions.

Key point: `nvidia-smi` should work **inside WSL**, not just in PowerShell. CUDA needs to be installed in the WSL environment.

## Multi-GPU rig: only one card is working

The worker starts one child per GPU on its own, but they all need their own ollama. If a box-wide `ollama serve` was already running on port 11434, GPU 0's worker adopts it instead of starting a pinned one — and that daemon sees every card, so the rig behaves like a single unpinned worker.

Stop the pre-existing daemon, then start the worker again:

```bash
pkill -f "ollama serve"           # macOS/Linux (also: sudo systemctl stop ollama)
taskkill /F /IM ollama.exe        # Windows
```

Then check the startup output. You should see `N GPUs detected — starting one worker per GPU`, and each child's lines prefixed `[gpu 0]`, `[gpu 1]`, … If you only want some cards, pass `--gpu 3` or `--gpu 0,2,5`. See [Multi-GPU rigs](/worker-guide/native-worker/linux#multi-gpu-rigs).

## "Too many workers from this network (max 10 per IP)"

The network caps concurrent workers at **10 per IP** and **10 per account**. On a rig with more than 10 GPUs the extra workers are refused at registration — run a subset with `--gpu 0,1,2,...` or split the rig across networks/accounts.

## Worker starts but gets no jobs

- Check that your worker benchmarks above 5 tok/s (minimum threshold)
- Make sure you're running the right model (Max tier only runs on native workers)
- The network matches jobs based on availability — if many workers are online, jobs are distributed
- A qwen worker only receives qwen jobs and a supergemma worker only supergemma jobs, so picking a model with no demand can mean no jobs
- Check the worker page at c0mpute.ai/earn for network status

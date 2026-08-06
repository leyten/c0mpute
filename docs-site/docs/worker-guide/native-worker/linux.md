---
sidebar_position: 2
title: Linux
---

# Linux setup

## Prerequisites

- **Node.js 18+** — install via [NodeSource](https://github.com/nodesource/distributions) or your package manager
- **NVIDIA GPU with 20GB+ VRAM recommended**
- **CUDA Toolkit**

## Install CUDA

Ubuntu/Debian:

```bash
sudo apt install nvidia-cuda-toolkit
```

Fedora:

```bash
sudo dnf install cuda-toolkit
```

Arch:

```bash
sudo pacman -S cuda
```

Verify the installation:

```bash
nvcc --version
nvidia-smi
```

Both commands should work. `nvidia-smi` should show your GPU and driver version. `nvcc` should show the CUDA compiler version.

## Get your token

Go to [c0mpute.ai/earn](https://c0mpute.ai/earn), login, and get your worker token from the Native Worker section.

## Run the worker

```bash
npx @c0mpute/worker --token <your-token>
```

On first run:
1. ollama is configured with CUDA support
2. A Max worker asks which model to run (Qwen3.5 27B or SuperGemma4 26B), showing how many workers are live on each and recommending the one with fewest. Only the chosen model downloads (~17GB).
3. A benchmark runs to verify GPU performance
4. The worker connects to the network and starts accepting jobs

Skip the model prompt with a flag:

```bash
npx @c0mpute/worker --token <your-token> --mode max --model qwen        # Qwen3.5 27B
npx @c0mpute/worker --token <your-token> --mode max --model supergemma  # SuperGemma4 26B
```

The worker auto-tunes its context window to the GPU's VRAM and enables flash-attention + q8 KV cache on NVIDIA automatically — no manual config.

Expected benchmark results:
- **RTX 3060 12GB**: ~30-40 tok/s
- **RTX 3080**: ~50-60 tok/s
- **RTX 4070 Ti**: ~60-80 tok/s
- **RTX 4090**: ~100+ tok/s

If you see less than 10 tok/s, CUDA is not being used. See [Troubleshooting](/worker-guide/native-worker/troubleshooting).

## Multi-GPU rigs

ollama loads a model that fits on a **single** card, so one worker only ever drives one GPU. On a box with more than one NVIDIA card the CLI detects them all and runs **one worker per GPU** — no flags, nothing to configure:

```bash
npx @c0mpute/worker --token <your-token> --mode max
# 8 GPUs detected — starting one worker per GPU (use --gpu <n> to run a single card).
```

You're asked for mode and model once. The process then supervises one child per card, each pinned with `CUDA_VISIBLE_DEVICES` and given its own ollama on port `11434 + <index>`, so the cards never share a daemon and each worker sizes its context window to the card it actually runs on. A single-GPU box behaves exactly as before.

### Stop your system ollama first

GPU 0's worker uses port 11434 — ollama's default. A pinned worker never restarts a daemon that is already serving its port (it can't tell yours from a sibling's, and killing it would take the other cards down), so a pre-existing box-wide `ollama serve` gets adopted as-is, and that daemon sees **every** GPU instead of just GPU 0. Kill it before you start:

```bash
pkill -f "ollama serve"
```

If you run ollama as a systemd unit, stop that too:

```bash
sudo systemctl stop ollama
sudo systemctl disable ollama
```

### Choosing cards

```bash
npx @c0mpute/worker --token <your-token> --mode max --gpu 3      # only GPU 3
npx @c0mpute/worker --token <your-token> --mode max --gpu 0,2,5  # only these three
```

Indexes are the ones `nvidia-smi` reports (0-15 supported).

### First run and logs

All the per-GPU daemons share one model store (`~/.ollama`), and a pull has no cross-process lock — parallel first-run downloads of the same model corrupt each other. So GPU 0 starts alone and the others follow once the model is on disk:

```
Starting GPU 0 first; the others follow once the model is on disk (first run only).
GPU 0 is ready — starting GPU 1, 2, 3.
```

Later starts skip the wait. Every child's output is prefixed with its card:

```
[gpu 0] Ollama: connected
[gpu 3] Benchmark: 104.2 tok/s
[gpu 5] worker exited (code 1) — restarting in 30s
```

A worker that dies is respawned on a fixed 30s backoff, so a wedged card can't crash-loop the rig. `Ctrl+C` (or `systemctl stop`) stops the supervisor and every child.

### Limits

The network accepts at most **10 workers per IP** (and 10 per account). On a rig with more cards than that, the extra workers are refused at registration.

## Run as a systemd service

For unattended operation, create a systemd service:

```bash
sudo nano /etc/systemd/system/c0mpute-worker.service
```

```ini
[Unit]
Description=c0mpute Native Worker
After=network.target

[Service]
ExecStart=/usr/bin/npx @c0mpute/worker --token YOUR_TOKEN
Restart=always
RestartSec=10
User=your-username
Environment=PATH=/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable c0mpute-worker
sudo systemctl start c0mpute-worker
```

Check status:

```bash
sudo systemctl status c0mpute-worker
journalctl -u c0mpute-worker -f
```

On a multi-GPU rig this is still **one** unit: the process it starts is the supervisor, and it owns the per-card workers. `journalctl -u c0mpute-worker -f` shows every card, `[gpu N]`-prefixed.

Alternatively, use `tmux` or `screen` for a simpler setup:

```bash
tmux new -s c0mpute
npx @c0mpute/worker --token <your-token>
# Ctrl+B, D to detach
```

## Updating

The worker does **not** update itself — it runs exactly the version you installed. That also means a long-lived service (systemd, tmux) keeps running whatever `npx` cached when you first started it. Upgrade explicitly:

```bash
npm i -g @c0mpute/worker@latest    # then run: c0mpute-worker --token <your-token>
```

Or, if you'd rather stay on `npx`, pin `@latest` in the command (including in your systemd `ExecStart`) so each start fetches the current release:

```bash
npx -y @c0mpute/worker@latest --token <your-token>
```

Every start prints the version it's running (`c0mpute worker v…`).

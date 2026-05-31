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

Go to [c0mpute.ai/worker](https://c0mpute.ai/worker), login, and get your worker token from the Native Worker section.

## Run the worker

```bash
npx @c0mpute/worker --token <your-token>
```

On first run:
1. ollama is configured with CUDA support
2. The Qwen3.5 27B model downloads (~17GB)
3. A benchmark runs to verify GPU performance
4. The worker connects to the network and starts accepting jobs

Expected benchmark results:
- **RTX 3060 12GB**: ~30-40 tok/s
- **RTX 3080**: ~50-60 tok/s
- **RTX 4070 Ti**: ~60-80 tok/s
- **RTX 4090**: ~100+ tok/s

If you see less than 10 tok/s, CUDA is not being used. See [Troubleshooting](/worker-guide/native-worker/troubleshooting).

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

Alternatively, use `tmux` or `screen` for a simpler setup:

```bash
tmux new -s c0mpute
npx @c0mpute/worker --token <your-token>
# Ctrl+B, D to detach
```

---
sidebar_position: 3
title: Windows
---

# Windows setup

Two options: **WSL** (recommended) or **native Windows**.

## Option 1: WSL (recommended)

WSL gives you a Linux environment inside Windows with better CUDA support and fewer compatibility issues.

### Install WSL2

```powershell
wsl --install
```

Restart your computer after installation.

### Install Node.js in WSL

Open your WSL terminal (Ubuntu) and run:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Install CUDA in WSL

NVIDIA GPUs are automatically passed through to WSL2. You need the CUDA toolkit **inside WSL** (not the Windows version):

1. Make sure you have the latest NVIDIA Game Ready or Studio driver on Windows
2. In WSL, follow the [NVIDIA CUDA on WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/)
3. Verify:

```bash
nvidia-smi    # Should show your GPU
nvcc --version # Should show CUDA version
```

### Run the worker

```bash
npx @c0mpute/worker --token <your-token>
```

A Max worker asks which model to run (Qwen3.5 27B or SuperGemma4 26B), showing how many workers are live on each and recommending the one with fewest. Only the chosen model downloads (~17GB). Skip the prompt with a flag:

```bash
npx @c0mpute/worker --token <your-token> --mode max --model qwen        # Qwen3.5 27B
npx @c0mpute/worker --token <your-token> --mode max --model supergemma  # SuperGemma4 26B
```

Get a token at [c0mpute.ai/earn](https://c0mpute.ai/earn).

## Option 2: Native Windows (PowerShell)

### Install Node.js

Download and install from [nodejs.org](https://nodejs.org/) (LTS version).

### Install CUDA Toolkit

1. Download from [developer.nvidia.com/cuda-downloads](https://developer.nvidia.com/cuda-downloads)
2. Run the installer — make sure to add CUDA to your PATH
3. Verify in PowerShell:

```powershell
nvcc --version
```

If `nvcc` is not found, add `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.x\bin` to your PATH manually.

### Run the worker

```powershell
npx @c0mpute/worker --token <your-token>
```

## Common issue: low tok/s on Windows

If you see ~5 tok/s instead of 30+, **CUDA is not being detected**. ollama is falling back to CPU inference, which is extremely slow.

Fixes:
1. Make sure `nvcc --version` works in your terminal
2. Make sure `nvidia-smi` shows your GPU
3. If using native Windows, try WSL instead — it handles CUDA paths more reliably
4. Make sure [ollama](https://ollama.com) is installed and running, and that it detects your GPU/CUDA (run `ollama ps` while a job is active — it should show the model on GPU, not CPU)

**WSL typically gives better performance and fewer issues than native Windows.** If you're having trouble with native Windows, switch to WSL.

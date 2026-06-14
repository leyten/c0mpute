---
sidebar_position: 8
title: c0mpute code
---

# c0mpute code

c0mpute code is an open coding agent that lives in your terminal. It reads, edits, and runs your project like the coding tools you already know, but the model runs on c0mpute's decentralized network instead of one company's servers. The file edits and shell commands run locally on your machine, under your approval. It follows the same three principles as the rest of c0mpute: **uncensored, private, decentralized**.

## Install

```bash
npm i -g @c0mpute/code
```

Requires Node 18+. Run it inside any project:

```bash
c0mpute-code                       # interactive, in your repo
c0mpute-code "fix the failing test in test_api.py"   # one task, then exit
```

On first run it asks for an API key (get one at [c0mpute.ai](https://c0mpute.ai) → settings → API keys) and saves it to `~/.config/c0mpute-code/config.json`. You can also pass it as the `C0MPUTE_API_KEY` environment variable, or re-set it anytime with `/login`.

## How it works

Describe a task and the agent works as a loop with real tools: it locates the relevant code, reads it, makes a small targeted edit, runs your tests, and stops when they pass. One command, no copy-paste.

- It **asks before every edit or command** (allow once, allow for the session, or deny). Reads run automatically.
- It shows a **colored diff** of every change.
- Edits are **small and targeted** (line-range replacements or search/replace snippets), not whole-file rewrites, with a tolerant matcher so it doesn't fight whitespace.
- Changes are **syntax-checked and auto-reverted** if they would break the file.
- It **verifies its own work** by running your tests, and won't claim something is done until it actually is.

The thinking runs on the network. The dangerous parts — your files, your shell — never leave your machine.

## Privacy

Your code stays where you are:

- **Edits and commands run locally.** Your codebase is never uploaded to a sandbox. It is read and written on your own disk.
- **Secrets are stripped on your machine** before anything is sent: API keys, `.env` values, private keys, and emails. The model only ever sees a placeholder.
- **You can paste an API key and just use it.** Ask the agent to wire a key into your project and it works like any other agent: the model sees a placeholder, and the real value is written straight into your local `.env` and never crosses the network.
- **Workers never learn who you are.** A worker is handed the snippet to process and nothing else — no account, no name.

To be precise: a worker does see the snippet it processes, the same as any inference. What is different is that no single company sees all of your code, ties it to you, or keeps a copy — and the whole thing is [open source](https://github.com/leyten/c0mpute-code), so you can verify exactly what leaves and what does not.

## Workspaces

Each project gets a `.c0mpute/` workspace. After every verified task the agent writes a short note of what it did to `.c0mpute/journal.md`, and reads it back on the next run, so it remembers past sessions and picks up where it left off. View it with `/workspace`. Commit it to share project history with your team, or add it to `.gitignore` to keep it local.

It also reads project notes from `c0mpute.md`, `AGENTS.md`, or `CLAUDE.md` in the repo root as context. Run `/init` to generate a `c0mpute.md` for the current project.

## Commands

| Command | What it does |
| --- | --- |
| `/init` | Generate project memory (`c0mpute.md`) for the current repo |
| `/workspace` | Show the project's work journal |
| `/login` | Set or replace your API key |
| `/help` | Show available commands |
| `/exit` | Quit (Ctrl-C interrupts a running task; again at the prompt exits) |

## Configuration

All settings are environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `C0MPUTE_API_KEY` | — | Your c0mpute API key (required) |
| `C0MPUTE_MODEL` | `c0mpute-max` | Model id. The default is the uncensored max model |
| `C0MPUTE_YOLO` | `0` | Set to `1` to auto-approve edits and commands |
| `C0MPUTE_API_URL` | `https://c0mpute.ai/api/v1` | Override the API base |
| `C0MPUTE_MAX_STEPS` | `40` | Max agent steps per task |

## Why it's different

Most coding agents are owned by the company that makes them. That company sees your prompts and your code, decides your rate limit, can ban your account, and can change the terms or go down — and your workflow goes with it.

c0mpute code turns that around. The model runs across many independent GPUs run by people, so there is no single provider to rate-limit you, ban you, or take it down. The models are uncensored, so it does not refuse legitimate work. Your code stays on your machine, and every line of the agent is open source. It is the same idea behind the rest of c0mpute: AI powered by people, not data centers.

## Links

- npm: [@c0mpute/code](https://www.npmjs.com/package/@c0mpute/code)
- Source: [github.com/leyten/c0mpute-code](https://github.com/leyten/c0mpute-code)
- The network: [c0mpute.ai](https://c0mpute.ai)

# Shard mode — try it locally

`--mode shard` turns the worker into a **node daemon**: it joins the network, gets
measured, gets assigned a slice of a big model, pulls that slice, and serves it as one
stage of a scattered ring. No operator, no SSH — one command.

## The one-command local demo

Boots a mock orchestrator + one daemon on your machine and streams the whole lifecycle
(enroll → announce → assign → pull → stage READY → serving):

```bash
git clone https://github.com/leyten/c0mpute
cd c0mpute/c0mpute-worker
npm install
npm run try-shard
```

- **On a box with an NVIDIA GPU** this self-provisions the real engine (a pinned vLLM
  venv + the sidecar + a weight slice — several GB, a few minutes the first time) and runs
  a **real stage on your card**. Re-runs are fast (everything's cached under `~/.c0mpute`).
- **On a box without a GPU** it uses a bundled shim so you still watch the full
  control-plane lifecycle end to end (no real weights).

Multi-node ring on one box (two daemons, two stages, bytes crossing a real libp2p tunnel):

```bash
NODES=2 LAYERS=3 npm run try-shard   # then run a second daemon — see scripts/try-shard.sh
```

Ctrl-C tears everything down.

## Joining the real network

Same command, your token, the real orchestrator:

```bash
npx @c0mpute/worker --mode shard --token cwt_...   # get a token at c0mpute.ai
```

The daemon self-provisions on first run, enrolls, and waits to be placed. Everything lives
under `~/.c0mpute` (node key, receipt key, engine, venv, weights) — delete it to start clean.

**On Windows?** See **[WINDOWS.md](./WINDOWS.md)** — WSL2 + one bootstrap command
(`scripts/wsl-setup.sh`). Relays for a NAT'd home box are discovered automatically now
(no `C0MPUTE_SHARD_RELAYS` needed).

## What's under the hood

- **Identity**: an ed25519 node key (`~/.c0mpute/node.key`) proves your PeerId to the
  network; a receipt key signs your per-stage work receipts. Never leaves the box.
- **Placement**: the network measures your GPU (`shard.probe`) and decides your role — you
  never self-report it.
- **Weights**: pulled verified against a signed manifest (peer-to-peer torrent path is the
  next step; today it's the mirror).
- **Serving**: a supervised `python -m shard.stage` process, tunnelled to its ring
  neighbours by the libp2p sidecar. Self-heals; re-joins warm after a ring dissolves.

## Environment overrides (advanced — you never need these for the demo)

| var | default | use |
|---|---|---|
| `C0MPUTE_SHARD_REPO` | `~/.c0mpute/shard` | an existing engine checkout |
| `C0MPUTE_SHARD_PYTHON` | `~/.c0mpute/venv/bin/python` | your own venv/interpreter |
| `C0MPUTE_SIDECAR_BIN` | `~/.c0mpute/bin/sidecar` | a prebuilt sidecar |
| `C0MPUTE_SHARD_RELAYS` | — | relay multiaddrs for a NAT'd home box |

# Publishing `@compute-network/worker` — CLASSIC line (this branch)

This is `release/worker-classic`: the package the **live network's** operators install.
It is deliberately **shard-free** — no shard mode, no shard sources, no betanet docs.
The betanet worker lives on `master` and publishes as **3.0.0** at the coordinated
go-live, never from here and never as a 2.8.x.

## What this line ships

Classic (text/image) releases only. **2.9.0** over the published 2.8.3 — the
single-model swap:
- One public model: **Qwen3.8 27B Uncensored** (`qwen3.8-27b-uncensored`). The
  qwen/supergemma picker is gone; `--model` is accepted but ignored (so old
  systemd units don't crash) and saved 2.8.x configs keep working headless.
- Self-packaged GGUF from a pinned HF revision (weights + vision projector,
  RENDERER/PARSER Modelfile, MTP speculative decoding on CUDA single-GPU),
  VRAM quant ladder (24GB Q4_K_M / 16GB IQ4_XS / layer-split noMTP), and a
  Apple Silicon on the GGUF noMTP build via Metal (2.9.1 — the 2.9.0 MLX
  pull 400'd in the field; ollama's hf.co ingestion is GGUF-only, and the
  faster mlx-vlm backend is a planned upgrade).
- Ollama version floor **0.32.15** checked at startup with a plain
  "upgrade ollama" message (old versions 500 cryptically; 0.32.14's CUDA
  build ran RTX 30xx on CPU).
- Multi-GPU fan-out now skips cards under the 16GB floor; a rig where no card
  fits runs one layer-split worker instead.

## Rollout mechanics — read before publishing

There is NO auto-update since 2.8.3: the deployed fleet stays on its version
until operators act. **The orchestrator must serve `qwen3.8-27b-uncensored`
in MODEL_CATALOG before any 2.9.0 worker starts** — a worker registering an
unknown model string gets zero jobs. Publish order: orchestrator deploy →
2.9.0 publish → announcement → migration window → final cutover (old model
out of the catalog + legacy-worker reject gate on, which makes 2.8.x print
the update instruction and exit).

## Rename (2.9.0): @c0mpute/worker -> @compute-network/worker

2.9.0 is the first release under the Compute Network name. npm cannot rename a
package, so the move is: publish the new name, then deprecate every version of
the old one with a pointer:

```bash
npm deprecate @c0mpute/worker "Moved to @compute-network/worker - npm i -g @compute-network/worker@latest"
```

Never publish new versions to @c0mpute/worker again; the cutover reject-gate
message tells the deployed 2.8.x fleet the new install command.

## The publish (explicit go from leyten, never automatic)

```bash
cd c0mpute-worker            # on release/worker-classic, clean tree
npm ci && npm run build
node dist/index.js --help    # smoke: no "shard" anywhere in the output
npm pack --dry-run           # file list must be dist/* + README.md + package.json only
npm publish --access public  # goes to dist-tag `latest`
```

Verify: `npm view @compute-network/worker version` → 2.9.0, and the tarball has no `shard-*` files.

# The node daemon — the gateway between a user's machine and the network

> Spec (2026-07-12, leyten decision: **ships inside `@c0mpute/worker`** — one product, one
> install, tiers inside it; no second install path). This is the PoC leg the definition-of-done
> missed: everything else proves the network works; THIS is what a stranger actually runs.
> Status: SPEC. Companions: `PERMISSIONLESS_LOOP.md` (the events this daemon is the missing
> client for), `PLACEMENT_AS_PROTOCOL.md` (M3's "node agent" = this daemon grown up),
> shard `docs/ADMISSION_SPEC.md` + `docs/MODEL_RUNTIME.md` (the seams it drives).

## 0. The reality that forced this

The 2026-07-12 hetero session measured the join path end-to-end on virgin cloud boxes:
**~45 min rental→serving clean-path** (~8 min pip torch/vllm, ~10 min probe incl. its weight
slice, ~7 min weights, ~8 min warm) — and **the network's placement decision itself took
seconds**. The expensive part of joining is moving bytes, not deciding. But today those bytes
are moved by an operator harness ssh'ing into boxes (`scratchpad/hetero_boot/join/deploy`) —
a benchmark tool, not a product. The daemon is that harness promoted into the thing a GPU
owner installs.

The steady-state truth the spec must preserve: **joining the network ≠ joining a ring.**
A machine enrolls once, holds verified ranges on disk, and gets grabbed by ring formation in
seconds-to-minutes. First-join is download-bound (torrent physics, users understand it);
re-join is warm.

## 1. The artifact

`@c0mpute/worker` (npm, exists, community-proven since June) grows a **shard mode**:

```
npx @c0mpute/worker --token cwt_... --shard
```

- The existing worker stays the supervisor: token↔account auth, self-update, telemetry,
  the whole-model Ollama tier untouched alongside.
- Shard mode adds a long-lived **node daemon** with three lifecycle phases (§2) driving the
  shard seams that all exist today: `shard.probe` (--measure/--serve/--net-only),
  `shard.fetch.fetch_block_range` + the sidecar (DHT/blockx/seed), the stage runtime behind
  `ModelRuntime`, signed receipts.
- One ed25519 **node key** minted at enroll (`~/.c0mpute/node.key`, 0600) = the libp2p
  identity, the announce signature, AND the receipt-signing key (`load_or_make_node_key` —
  the same key the bind step ties to the account; earnings attribution needs nothing new).

## 2. Lifecycle

### Phase A — ENROLL (once per machine, target ≤15 min on 100 Mbps)
1. Detect hardware (GPU/arch/VRAM/disk — extends the worker's existing `setup.ts` detection).
2. **Provision the runtime as a content-addressed artifact** (§3) — not pip.
3. Pull the probe slice (~2.4 GB: config + index + layer 30's shards) and self-measure:
   `shard.probe --measure` → the capability vector (footprint, transient, layer_ms,
   fast-kernel — the numbers that caught a corrupt-graph Pro 6000 this session).
4. Start the `--serve` listener (probe peer for others) + the sidecar.
5. `node:announce` with the measured vector. The server drives its own verification at bind
   (#19 semantics — role is NEVER self-reported); verdict lands in `node_role`.

### Phase B — STANDBY (continuous, the default state)
- Keep the announce fresh (TTL cadence; re-measure on hardware/env change).
- **Seed verified ranges** held on disk (sidecar `-seed`) and serve as an assigned probe peer
  — standby machines are the swarm's bandwidth, exactly the torrent role.
- Heartbeat; accept spot-checks (`swarm:challenge`).

### Phase C — SERVE (on `swarm:assign`)
1. Report the RTT/uplink round the formation asks for (`probe --net-only` vs assigned peers —
   the "RTT-mesh collection" integration gap named in swarm-loop.ts; the daemon closes it).
2. Pull `[lo,hi)` verified, PEERS-FIRST (`fetch_block_range` + ChainProvider — ringmate
   seeding and same-peer resume are live-proven).
3. Launch the stage locally (§4), connect tunnels via the sidecar, `swarm:ready`.
4. Serve; receipts per stage; settle via the existing loop.
5. On dissolution/churn: back to STANDBY **with ranges retained** — the ≤3 min re-join.

## 3. The runtime is a torrent artifact, not a pip install

The single biggest onboarding cost (and reproducibility hazard) is the Python/CUDA stack.
Fix: prebuilt, signed, content-addressed runtime bundles pulled over the SAME block-exchange
as weights and seeded by the same nodes:

```
runtime-cuda-sm120-torch2.11-vllm0.23.tar.zst   (~5 GB, manifest-signed)
runtime-cuda-sm89-...                            (marlin-class cards)
runtime-mlx-...                                  (Mac: mlx + mlx-lm, ~200 MB — near-trivial)
```

- Kills the ~8 min pip term (→ ~1-2 min fetch+extract at 100 Mbps once peers seed it).
- **Pins the numerics environment**: the kernels ARE the accepted-numerics class receipts
  quote (fp8-wire/graph lessons) — a pinned bundle means a stage's numerics are knowable
  from its manifest hash, which feeds the receipt (backend, quant, runtime) pinning.
- Verification = the same manifest-signature trust root as weights. No new machinery.
- Windows: WSL2 required for the CUDA tier at v0 (vllm reality) — stated, not hidden.

## 4. Shard-side seams (the only new engine work)

Everything the daemon drives exists; the one genuinely new piece:

- **`python -m shard.stage`** — a supervised local stage entrypoint (what
  `m25_scatter_pipe.launch_stage` does over ssh, made a first-class CLI the daemon execs:
  env from the assignment, ModelRuntime backend by arch, stdout contract for ready/health).
  Today's launch string lives in an operator harness; promoting it is a small, mechanical PR.
- Nice-to-have, later: `shard.stage --health` unified with the sidecar heartbeat (the
  `stage_health()` seam already named in PLACEMENT_AS_PROTOCOL §9).

## 5. Join-latency budget (targets, from measured 2026-07-12 numbers)

| step | today (measured) | target | how |
|---|---|---|---|
| enroll: runtime | ~8 min (pip) | ~2 min | §3 artifact |
| enroll: probe + slice | ~10 min | ~5 min | overlap slice pull with runtime fetch |
| first assignment: weights | wire-speed (7 min @8 Gbps; 30 min @100 Mbps for 22 GB) | same | physics; peers-first helps |
| re-join (ranges on disk) | ~12 min (incl. operator fixes) | **≤3 min** | load + capture + tunnels only |
| the placement decision | seconds | seconds | proven |

## 6. Trust + safety notes

- Role/capability: server-verified at bind, never self-reported (unchanged, #19).
- The daemon never chooses its probe peers (assigned; VRF-over-staked at M3 —
  PLACEMENT_AS_PROTOCOL §3).
- **Auto-update is the scariest surface**: a hijacked update = mass node compromise. Signed
  releases, staged rollout, and the runtime artifacts verified against the manifest trust
  root. Update POLICY is a leyten call (§7).
- Standby seeding donates upload bandwidth — default + a visible knob, consent stated in the
  installer UX (§7).

## 7. Decisions for leyten (flagged, not decided)

1. **Auto-update signing/staging policy** (who holds the release key; canary %).
2. **Standby seeding default** — on by default with a cap? (bandwidth-donation consent UX).
3. **Windows tier**: WSL2-only honestly documented vs deferred entirely at v0.
4. Worker UI framing of tiers (whole-model vs shard mode naming/earnings display).

## 8. Build list (ranked)

1. Daemon skeleton in `c0mpute-worker` (announce/assign/ready client + supervision; the
   socket events already exist server-side in swarm-loop.ts).
2. `python -m shard.stage` local entrypoint (shard PR — promote launch_stage).
3. Runtime-artifact pipeline: build + sign + publish the sm120 bundle; fetch-path reuse.
4. RTT-mesh round in the daemon (probe --net-only vs assigned peers, report to formation).
5. Enroll UX (`--shard`, key mint, measured announce) + STANDBY seeding.
6. Mac backend wiring (once MlxRuntime passes its Mac gate — docs/MLX_RUNTIME.md).
7. Auto-update policy implementation (after leyten's §7 call).

Acceptance for the leg: **a stranger's machine, one command, no operator ssh — enrolls,
announces, gets measured, gets placed by the loop, serves with valid receipts, and re-joins
warm in ≤3 minutes after a ring dissolves.** (The 2026-07-12 receipt proved all of that
minus the "one command, no operator" part — that gap IS this leg.)

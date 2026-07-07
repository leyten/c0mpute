# c0mpute — the permissionless loop (sharded swarms)

The orchestrator today drives **one whole model per worker**: a job goes to a single box that holds the
entire model. That can't serve a 200B+ model, which no consumer card fits. This is the other mode, added
**alongside** the whole-model path (nothing in `WorkerInfo`/`Job` changes): a node announces its hardware,
c0mpute places it into a **pipeline of shards** (each holding a layer range) that end-to-end form one model
copy, the nodes pull their range (verified) and auto-form a ring that serves, and pay fans out **per shard**.

This is `NETWORK_ARCHITECTURE.md` §2 made concrete, using the pieces shard already ships.

## The loop

```
node ─announce─▶ ADMIT ─▶ PLACE (shard.plan) ─▶ assign ─▶ node PULLS range (shard.fetch, verified)
                                                              │
   pay per shard ◀─ SETTLE (shard.verify) ◀─ serve ◀─ ring AUTO-FORMS ◀─┘
```

1. **Announce** — a node advertises a shard capability: `{pubkey, gpu, freeVramMb, subnet, cpuFactor, upMbps}`
   for a `(model, manifestRef)`. (`node:announce`.) Unlike `WorkerCapabilities` (product flags), placement
   needs **hardware** — VRAM to fit layers, measured compute to balance stages, latency + uplink to cluster.
2. **Admit** — an admission policy gates the join (see fork A). Admitted nodes enter the candidate pool.
3. **Place** — when a model has enough capable candidates, the orchestrator collects a measured RTT matrix
   over the pool and calls `python3 -m shard.plan` → a deployable ring: head-first order, per-stage layer
   blocks, and off-critical-path **roles** (verifier/standby) for the nodes it doesn't put in the ring.
4. **Assign** — the orchestrator emits `swarm:assign` per stage: `{swarmId, manifestRef, layerStart,
   layerEnd, role, isHead, isTail, peers, coordinatorNodeId}` (INTEGRATION.md §7).
5. **Pull + form** — each node pulls exactly `[layerStart, layerEnd)` of `manifestRef` **verified**
   (`shard.fetch_block_range` re-hashes every byte against the signed manifest), warms, connects to its ring
   neighbours over shard's transport, and signals `swarm:ready`. When all stages are ready, the swarm serves.
6. **Serve** — activations loop `coordinator → stage 0 → … → tail → coordinator`, one loop per token, via
   the existing engine (`m25_scatter_pipe`). Every stage signs a per-stage receipt (activation hash-chain).
7. **Settle + pay** — on completion the coordinator returns one signed receipt per stage. The orchestrator
   calls `python3 -m shard.verify` (`swarm:job_complete`): signatures, coverage tiling of the whole model,
   the per-job freshness nonce (no replay), the activation chain, and per-signer block binding — all must
   hold, or **nobody is paid**. On success it returns the per-stage split, and the job's tokens fan out to
   each node's account **per shard**.

## What shard already provides (the boundary holds: deps point c0mpute → shard, over stdio)

| Step | shard piece | seam |
|---|---|---|
| Place | `topology.select_ring` (calibrated by `plan_ring`) | `python3 -m shard.plan` |
| Pull  | `fetch.fetch_block_range` (verified, signed manifest) | node-side |
| Serve | `m25_scatter_pipe` + spec-decode coordinator | node-side |
| Settle| `receipt.verify_coverage` | `python3 -m shard.verify` |

The three are contract-compatible: `plan` emits `{stages:[{id,lo,hi}]}`, the pull consumes `[lo,hi)`, the
receipts attest `[lo,hi)`, and `verify` checks the set tiles the model. `scratchpad/ring_up.py` already
chains place→pull→serve for a rented ring; the loop is that flow driven by **announced** nodes + metering.

## The c0mpute side (this change)

- `lib/orchestrator/swarm-types.ts` — the data model (`NodeCapabilities`, `StageAssignment`, `SwarmInfo`).
- `lib/orchestrator/swarm.ts` — `SwarmManager`: admit, candidate pool, `formSwarm` (calls the plan seam,
  emits assignments), `markReady`, `settleJob` (calls the verify seam, splits pay), `onNodeGone`.
  Orchestrator-agnostic (injected seam + emit + earnings sink), so it runs headless and wires in unchanged.
- `lib/orchestrator/swarm-seam.ts` — `SubprocessSeam`: spawns the two shard modules over stdio.
- `lib/orchestrator/swarm-loop.ts` — `attachSwarmLoop(io, opts)`: registers the socket handlers on the live
  server. The orchestrator hook is a single call in its constructor; the whole-model path is untouched.
- `scripts/swarm-loop-demo.ts` + `scripts/sim_nodes.py` — the loop end-to-end without a GPU, against the
  **real** `shard.plan` + `shard.verify`. Run: `npx tsx scripts/swarm-loop-demo.ts`. It shows a 5-stage ring
  formed from 6 announced nodes (the slow low-uplink box relegated), a job's tokens split per shard, and
  replayed / coverage-gap settlements paying nobody.

## Decisions (leyten, 2026-07-07 — LOCKED)

Both were live in `SwarmConfig` so the choice is config, not a refactor.

**A. Admission — OPEN** (`SwarmConfig.admission = { mode: 'open', minFreeVramMb }`, §10.3).
Permissionless from the start: any node past a coarse **proven** VRAM floor is admitted; PLACEMENT decides
its role (a weak node still earns as a verifier/standby, not turned away at the door). Chosen because open
supply is the endgame anyway and a curated door risks a supply bottleneck.
- **SAFETY GATE (non-negotiable):** open ADMISSION is not open TRAFFIC. The network must not serve untrusted
  jobs until the placement rails are live: **boundary-layer pinning** (the leaky embedding + final layers,
  from which 35–59% of a prompt is reconstructable, go only to staked/trusted nodes — strangers hold deep-
  middle), **graded reputation**, and the **layer-block spot-check**. `open` lets a node in; *placement* is
  what keeps a stranger off a sensitive role. **These rails are the launch blocker** (see Remaining
  integration) — turning open admission into open service before they exist would leak prompts, which is the
  opposite of the goal.

**B. Pay split — BY LAYERS** (`SwarmConfig.paySplit = 'layers'`, §6).
A job's tokens divide across the shards proportional to the layers each held (paid for the work done). Chosen
for simplicity + ungameability (a node computes its own pay from public info; zero operator discretion — the
most decentralized option). **Expected to change:** a **boundary-role premium** (pay the pinned sensitive
roles more) is the likely v2, but it's deferred on purpose — it bakes a value judgment into the money (hard
to change once earnings flow) and may be redundant once boundary-pinning restricts those roles structurally.
Add it only if trusted operators demonstrably won't take boundary roles without it.

**C. Coordinator trust / where the optimizer sits** (§10.1) — **central** for the PoC (the orchestrator runs
`select_ring`; it holds no weights/keys, so it decentralizes later as a clean follow-up). Not a blocker.

## Settlement is defended as an untrusted path

In the open case the coordinator is a volunteer node, so `settleJob` treats it as untrusted:
- **only the coordinator may settle** a job (`submitterNodeId == coordinatorNodeId`); any other node's
  `swarm:job_complete` is rejected;
- **each `(swarm, job)` settles at most once** (a `settled` ledger) — re-submitting an honest set can't pay twice;
- **the token count is bounded** at `MAX_SWARM_JOB_TOKENS` (= the whole-model `MAX_OUTPUT_TOKENS`), and
  non-finite/negative counts are rejected;
- **the verify seam fails closed** — a seam crash / non-JSON output rejects the job (pays nobody), never throws;
- **one identity holds one ring slot** — announce dedups by pubkey (and socket), and form refuses a duplicate
  pubkey, so a collision can't misattribute the split or brick settlement;
- **the pay account is frozen onto the stage at form time**, so a node that served then disconnected is still paid.

**Known gap (bounded, not closed):** the receipt set attests *which* layers each node ran, but not *how many
tokens* — so the coordinator's token count is trusted up to the cap. Closing it needs a client- or server-side
token count bound to the job (INTEGRATION.md §6 / the "coordinator-untrusted output attribution" item) before
real payout. With OPEN admission the coordinator is an untrusted volunteer, so this must close before real
open payout (the cap bounds it meanwhile).

`scripts/swarm-loop-demo.ts` exercises each of these: a non-coordinator settle, a double-settle, and a
1e9-token claim are all shown paying nobody / capped.

## Remaining integration

- **⛔ SAFETY RAILS — the OPEN-launch blocker (decision A).** Open admission means untrusted nodes hold model
  shards, so before the network serves real traffic: (1) **boundary-layer pinning** — placement keeps the
  leaky embedding/final layers on staked/trusted nodes, strangers only hold deep-middle; (2) **graded
  reputation** — a per-node score gating which roles a node may hold (not today's binary ban); (3) **layer-
  block spot-check** — seeded redundant recompute of a random block on a trusted node (`shard/challenge.py`
  primitive exists). Until these are live, run rings only over trusted/own boxes even though admission is open.
- **RTT collection + auto-form trigger.** `formSwarm` needs a measured RTT matrix over the candidate pool
  (a short probe round the nodes run and report) and a trigger (a model's pool reaching a coverable set, or
  demand for that model). The manager exposes `formSwarm(model, manifestRef, profile, rtt)`; the probe +
  trigger is the next step.
- **Pay wiring.** `recordSwarmStageEarning` logs the verified per-shard split today; mapping it onto
  `recordEarning()` (tier / creditsCharged / payout basis) is decision **B**. The split is already correct —
  only the $ mapping waits.
- **Token-attested pay.** Close the known gap above — bind the paid token count to the job, not the
  coordinator's word.
- **pubkey → account binding + announce challenge.** The loop binds a node's socket to its authenticated
  account; the durable binding is a node's ed25519 identity (its libp2p PeerId) ↔ its c0mpute account
  (INTEGRATION.md §2.3), proven at announce with a challenge/response so a pubkey can't be spoofed to grief.

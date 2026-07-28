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

## PoC decision (leyten, 2026-07-08): fully open; cheat-detection on; prompt privacy DEFERRED

For the PoC, **any machine may join any swarm and hold any slice.** Prompt privacy is a **known,
accepted limitation** — a node in the ring can observe the activations it processes and could try to
reconstruct part of the prompt/answer. We are not solving that now, because the fix (mandatory
boundary pinning) needs trusted nodes in ~40% of every ring and re-introduces the very supply
bottleneck open admission exists to avoid.

What we DO run on the fully-open network is **CHEAT detection**, which needs no trusted stage inside a
ring:
- **Receipts** — every stage signs a receipt for its slice, and they chain around the ring
  (`out_root[i] == in_root[i+1]`). Skip layers, fabricate, or replay ⇒ the chain breaks ⇒ settlement
  **pays nobody.** Structural fraud caught for free on every job.
- **Spot-check** — a we-run staked **auditor** (a handful of boxes we operate, off to the side and
  occasional — NOT a stage in any ring, so **zero supply tax**; the sharded analogue of the
  whole-model canary infra) re-derives a seeded block and compares against the suspect's output,
  catching lazy/fake compute that receipts can't (a node hashing plausible numbers without doing the
  matmuls). Fail ⇒ reputation strike ⇒ dropped.
- **Graded reputation** — pass/fail history gates roles and refuses repeat cheaters at admission.

Cheat detection catches a node that does the work *wrong*; it cannot catch a node that does the work
*correctly but also copies the prompt* (snooping is passive and leaves no trace). That residual is the
deferred privacy gap. `DEFAULT_SWARM_CONFIG.privacy = null` (open); the rails below are the **opt-in
private tier** for later, set `privacy` per swarm/request.

## Privacy rails — BUILT + PROVEN (the opt-in private tier, OFF by default)

An untrusted stage can invert the activations it forwards back toward the prompt, and the engine's own
wire makes the ends worse (the head embeds the raw prompt token ids; the tail turns logits into output
token ids). These rails buy prompt privacy at the cost of trusted nodes in the ring — so they are the
paid private tier, not the PoC default. They are built, adversarially proven, and gate ROLES, not membership:

- **Boundary-layer pinning** (`SwarmConfig.privacy`, default `{boundaryIn: 8, boundaryOut: 8}`).
  `formSwarm` sends `shard.plan` a per-node **trusted** flag — ASSIGNED here from stake + reputation,
  never read from the announce payload — plus the boundary window. `select_ring` keeps the head/tail
  roles and every stage holding a `[0, 8)` or `[54, 62)` layer on trusted nodes; strangers hold only
  deep-middle. Grounded in the inversion literature (arXiv 2602.16760, 2507.16372): naive prompt-token
  recovery falls ~59% → 35% by 8 layers in, and 8 output layers deny the free logit-lens read; the
  output side leaks worse, so `boundaryOut ≥ boundaryIn` (hard floor 4/4, regulated-data tier 12/12).
  **Fails CLOSED:** privacy on with no trust oracle refuses to form; a plan that placed a stranger on a
  boundary stage is rejected before any assignment goes out.
- **Graded reputation** (`reputation.ts`) — a per-node score gating `boundary` (stake-gated: score
  alone never earns it) / `middle` (the open-admission default for a stranger in good standing) /
  `relegated` (off-stage only) / `rejected` (refused at announce). Recent-behaviour scoring like the
  whole-model canary ban; two consecutive spot-check fails reject outright. Fed by settlement verdicts,
  spot-checks, and churn. Replaces the binary ban for shard nodes.
- **Layer-block spot-check** (`startSpotCheck` → `shard.challenge`) — seeded redundant recompute of a
  stranger's block on a trusted verifier; the torch-free `shard.challenge` seam judges the sketch pair
  by cosine tolerance, and the verdict feeds reputation. A silent suspect fails on timeout (refusal is
  not free); a failed check degrades the swarm.

Proven end-to-end against the REAL shard seams (`scripts/rails-demo.ts`): with 3 staked + 4 stranger
nodes and open admission, the real `shard.plan` keeps every stranger off the boundary layers, and the
real `shard.challenge` catches a stranger faking its block (cosine ≈ 0), strikes it, and relegates it
off the stage pool. Headless unit coverage in `scripts/rails-test.ts` (18 assertions).

**⇒ FORK for leyten — the privacy STANCE (see below) and the trusted-node set are still leyten's calls.**

## Remaining integration

- **RTT collection — landed; the co-signed upgrade has not.** The orchestrator hands each candidate a
  rotating slice of peers (`swarm:probe_peers`), the node times a TCP connect to their announced sidecar
  addrs and reports back (`node:rtt`), and `lib/orchestrator/rtt-cache.ts` hands `autoForm` a pool-aligned
  matrix synchronously. Before this, `formSwarm` got a constant 30 ms matrix, which made the planner's
  objective identical across every permutation — ring order, head election and the `_TRIM` cull were all
  announce arrival order. Pairs nobody has measured still fall back to the 30 ms placeholder, so a pool
  that never reports forms rings exactly as it did. The samples remain SELF-ATTESTED: a two-sided pair
  takes `max()` of the two claims per PLACEMENT_AS_PROTOCOL.md §3, but receiver-signed observations and
  disinterested-prober assignment are the level-2 work in that document.
- **Pay wiring.** `recordSwarmStageEarning` logs the verified per-shard split today; mapping it onto
  `recordEarning()` (tier / creditsCharged / payout basis) is decision **B**. The split is already correct —
  only the $ mapping waits.
- **Token-attested pay.** Close the known gap above — bind the paid token count to the job, not the
  coordinator's word.
- **pubkey → account binding + announce challenge.** The loop binds a node's socket to its authenticated
  account; the durable binding is a node's ed25519 identity (its libp2p PeerId) ↔ its c0mpute account
  (INTEGRATION.md §2.3), proven at announce with a challenge/response so a pubkey can't be spoofed to grief.

## Privacy stance — DECIDED (leyten, 2026-07-08)

**Run the PoC fully open; defer prompt privacy.** The mandatory-pinning option was rejected because it
taxes open supply (trusted nodes in ~40% of every ring — the bottleneck open admission avoids). Prompt
privacy is a known, accepted limitation of the PoC. Cheat-detection (receipts + spot-check + reputation)
runs on the open network and needs no trusted stage in a ring.

The pinning rails stay BUILT + proven as the **opt-in private tier** for when we want it (a paid
"private" mode: a request sets `privacy` and is placed only on staked nodes / a wider window). When that
tier is turned on, one economics decision remains **leyten's**: **who counts as a "staked/trusted" node**
— what stake buys a `boundary` role and whether early boundary operators are c0mpute-run/vetted until an
open staked set exists. The seam is ready: `GradedReputation.isStaked(pubkey)` (ties into
`lib/onchain-staking.ts`). Not on the PoC critical path.

Options considered (kept for the record): (a) boundary-pin-only [taxes supply → rejected for the PoC],
(b) per-request trusted routing [the future private tier], (c) activation obfuscation [R&D — secret
per-request orthogonal transforms, ConjFormer-style; fp8-wire and hidden-dim permutation give ~ZERO
privacy against a public-weights attacker, do not claim them].

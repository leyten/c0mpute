# Launch readiness — what actually stands between the PoC and a public network

> 2026-07-12. Three-agent panel (control-plane code audit, comparable-testnet research + license
> verification, adversarial launch-day exercise), synthesized. The question it answers: "is the
> remaining work just (a) finish hetero swarms and (b) the node daemon?" **Answer: no — those
> are the node-side halves. The server half of the seam has never existed in a deployed
> process, and it is the biggest remaining cluster.** Companions: NODE_DAEMON.md (leg 7),
> PLACEMENT_AS_PROTOCOL.md, shard docs/M25_ENGINE.md (leg list).

## 0. The headline finding (code audit)

Legs 1-6 proved the SERVING plane (rings serve verifiably, live receipts). The SwarmManager
proved the CONTROL plane (announce→admit→place→settle) — in sims and operator-driven scripts.
**On master they have never been connected:** `attachSwarmLoop`'s `formSwarm` handle is
discarded by the production orchestrator (orchestrator.ts:181 — no swarm has ever formed from
a live announce outside a script); the ring gateway never posts receipts back to c0mpute (so
settlement never fires on real traffic); `recordSwarmStageEarning` is a console.log;
`GradedReputation` is never instantiated; the auditor would no-op if called ('no trust oracle
wired'); `degraded` is a terminal swarm state nothing ever heals.

## 1. The launch-blocking list (consolidated, ranked)

### Leg 6 — finish the any-device proof (known; hardware-gated)
Mac stage live via MlxRuntime (Mac gate in shard docs/MLX_RUNTIME.md) → the mixed-spectrum
demo receipt. Blocked only on Apple silicon (Scaleway M4-XL or an owned Mac).

### Leg 7 — the node daemon (known; spec'd NODE_DAEMON.md)
The node half of the seam: one command, enroll/standby/serve, runtime-as-torrent-artifact,
`python -m shard.stage` (does not exist yet — verified).

### Leg 8 — THE MISSED LEG: the network runs itself + has a front door (server half)
Every item verified missing in code, with build-shape:
1. **Auto-form trigger + server-side RTT collection.** formSwarm return discarded; the
   RTT-mesh NOTE in swarm-loop.ts built nowhere server-side. Build: hold the handle, collect
   the pool matrix (drive the daemon's `probe --net-only`), a per-model "pool covers + demand"
   trigger. *(days)*
2. **Heal reconciler.** `onNodeGone` → `degraded` → nothing. Both halves exist (formSwarm,
   the standby pool, engine resume primitives); wire: degraded → re-form from pool, drive
   resume. Without it, volunteer churn kills the network operationally in hours (the Petals
   lesson — their measured failover machinery is the reference). *(days)*
3. **Settlement fires on real traffic + a durable earning record.** The coordinator/gateway
   must emit `swarm:job_complete` with receipts; map the verified split to a DB row (points
   at PoC — see §3). Today: nothing is recorded at all. *(days)*
4. **Route the AUTHED metered API to rings.** c0mpute's real `/api/v1/chat/completions` (keys,
   quotas, billing) doesn't know shard models; the ring's own gateway has NO auth, NO rate
   limit, UNCAPPED max_tokens, one ring behind one lock — a single laptop DoS's it or runs a
   free tab. Build: mapModel entry + submit/stream path through the authed layer; clamp and
   firewall the naked gateway. **The adversary's #1 refuse-to-launch-without.** *(the biggest
   item — a real submit path, ~week-class)*
5. **Model catalog + manifest distribution.** `manifestRef` is a bare string minted in
   scripts; no store maps it to a signed manifest + pinned publisher pubkey; a stranger's
   daemon cannot discover its weights. Engine trust root exists (shard/manifest.py) — build
   the catalog table/endpoint + pin the publisher key in the shipped daemon. *(days)*
6. **Transport authorization.** The libp2p sidecar pipes activation streams from ANY peer
   into the engine socket (sidecar main.go:517) — a stranger who learns a stage addr can
   inject frames into a live ring. Build: ringmate allowlist per assignment (gate the
   activation proto to current ring PeerIds). PSK mode stays dev-only (single shared secret —
   its own docstring disqualifies it). *(small, real)*
7. **Reputation instantiated + spot-check scheduler + ≥1 we-run auditor.** The whole
   cheat-detection stack is built and INERT: no oracle injected, no cadence, no auditor
   runner, and on the fp8 production wire the receipt chain-check is off — so a lazy stage
   (right hashes, skipped matmuls) is never detected. Build: instantiate GradedReputation
   (with snapshot persistence), probabilistic spot-check scheduler, one auditor node we run.
   **Ship the verification Petals only ever promised — it's the moat claim.** *(days)*
8. **Observability: the health page.** Swarms are invisible in NetworkStats. A Petals-style
   live page (per-layer coverage map, per-node MEASURED tok/s, receipts-verified counters) is
   both ops necessity and the single best growth artifact (research lesson: show verified
   work happening NOW, never a node-count you can't defend — io.net's explorer detonated its
   own credibility). *(days)*

### Launch hygiene (cheap, do at launch)
- **License compliance trio (verdict: GREEN incl. P2P redistribution — expressly:** NVIDIA OML
  grants distribution "through multiple tiers"; the MiniMax Model License permits distribution
  with no channel restriction): (1) embed LICENSE-MODEL + the exact MiniMax NOTICE line (+ the
  NVIDIA OML notice for the NVFP4 shards, which ship no license file in-tree) in the shard
  manifest/torrent payload so every re-seed is automatically compliant; (2) "Powered by
  MiniMax M2.5" in any commercial-facing UI (UNGATED requirement in M2.5's modified-MIT — the
  lineage's revenue threshold was dropped); (3) `modified: true` + `derived_from` fields in
  manifests for repacked/quantized files. Watch-items: NVIDIA's grant is *revocable* + has a
  guardrail-circumvention termination clause (if it ever matters, quantize NVFP4 ourselves
  from the base weights → solely MiniMax terms); upstream license_link is broken — comply
  with both texts (compatible), human-eyeball LICENSE-MODEL before launch publication.
- **Prompt-privacy disclosure.** Node operators see prompts/activations (accepted PoC
  limitation, boundary-pinning built as the opt-in private tier). Accepted ≠ undisclosed:
  ToS + UI notice. Expect prompt-scraping nodes day one; disclosure is the honest v0 answer.
- **Auto-update posture v0:** manual-approve/off; runtime + release publisher keys pinned in
  the shipped daemon; keys separated (weights vs runtime).

## 2. Research lessons that shaped the ranking (comparables)

- **Join friction is a security parameter.** io.net (one-command, no stake, rewards on
  claimed capacity) → ~1.8M spoofed GPUs, credibility collapse. Akash (K8s + stake) → zero
  sybils, near-zero scale. The winning middle (Nosana, Chutes): one command + a MANDATORY
  MEASURED BENCHMARK at admission — which is exactly our probe. Never rank/pay on
  self-reported metadata. If points exist at launch, hardware-truth challenges ship FIRST.
- **Recognition-only supply has a ~12-month half-life** (Petals → one hobbyist per swarm;
  Gensyn → 12k airdrop farmers, then sunset). Even a minimal real settle→credit loop at
  launch beats a big one promised later.
- **Demand-first beats supply-first**; the strongest magnet is free frontier inference as a
  TIME-BOXED, rate-limited subsidy (Chutes' free R1, Hyperbolic's free 405B). Target demand
  local inference can't serve — a 229B with verifiable receipts is on the right side of the
  llama.cpp line.
- **Expect the Bittensor day-one attack**: nodes proxying a centralized API or returning
  cheap wrong outputs — the spot-check scheduler (leg 8.7) is the counter, and it must be ON.
- **Petals' specific death**: centrally-run bootstrap/health infra rotted before the code;
  one-model-one-swarm migrations reset supply to zero; verification stayed a wiki promise.
  Copy their churn mechanics (greedy block assignment, >20%-improvement rebalance damping,
  client-side replay failover), ship the verification they didn't.

## 3. leyten's decision points (surfaced, not decided)

1. **The PoC earnings answer** (blocks leg 8.3's schema): points ledger vs credits vs
   nothing-but-leaderboard. Hard constraint from the adversary + §10.4: NO supply-side
   subsidy (self-dealing with valid receipts = solvency hole); demand-anchored/points only.
2. **Launch shape:** gated phase-1 (Nosana-style: capped nodes, benchmark-admitted via the
   probe, points pool) vs open-from-day-one. Panel lean: gated cap first — it absorbed
   every comparable's sybil wave.
3. **Free playground:** budget + time-box + rate limits (the demand magnet, planned as a
   marketing burn with an exit).
4. **Standing network cost:** who funds the seed boxes + the auditor node ($3-4/h-class for
   one ring 24/7 ≈ $2.5-3k/mo on vast-style supply) vs demo-window operation until real
   supply arrives.
5. Auto-update key custody/staging; seeding-default consent (carried from NODE_DAEMON §7).

## 4. Sizing (honest)

Leg 8 items 1/2/3/5/6/7/8 are each days-class (the mechanisms exist; the work is wiring +
one scheduler + one allowlist + one table + one page). Item 4 (authed API → ring submit path)
is the week-class piece. **Leg 8 ≈ 2-4 focused sessions.** Leg 6's remainder is
hardware-gated, not effort-gated. Leg 7 is the daemon build (worker shard mode + runtime
artifact pipeline + shard.stage) ≈ 2-3 sessions. Nothing on this list is research-shaped;
it is all known-mechanism engineering.

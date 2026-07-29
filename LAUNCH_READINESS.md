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
5. ~~**Model catalog + manifest distribution.**~~ ✅ **BUILT 2026-07-20** (this PR + shard #125).
   `manifestRef` becomes `mf1:<name>@<cid>`; the daemon resolves the signed doc from the
   orchestrator's static `/manifests/<name>.json`, pins the network publisher key
   (`MANIFEST_PUBKEY` in shard-runner.ts — the SIDECAR_SHA256 pattern), and `shard.fetch`
   enforces bytes==CID + pinned signature + model_id/layer_count cross-checks fail-closed.
   Self-published throwaway-key manifests + the raw serving pull are DELETED (dev hatch:
   `C0MPUTE_SHARD_MANIFEST_FILE`, refused whenever an assignment carries `mf1:`). Standby
   sidecars now `-seed`; assignments hand out free-candidate seeders + `SWARM_SEED_ADDRS`.
   **Remaining = the one-time LAUNCH PUBLISH runbook step (leyten):** on the ops box, from the
   shard checkout root, run
   `python phase0/publish_manifest.py --hf nvidia/MiniMax-M2.5-NVFP4 --key <OFFLINE key> --out m25-nvfp4-v1.json --version 1`,
   check the doc into `public/manifests/m25-nvfp4-v1.json`, paste the printed
   `publisher_pubkey` into `MANIFEST_PUBKEY` (the `C0MPUTE_SHARD_MANIFEST_PUBKEY` fallback string
   in `c0mpute-worker/src/shard-runner.ts`, baked into the npm build — flip the worker's
   `MANIFEST_REF` default to the same full `mf1:…@<cid>` ref in the same edit), flip
   `MODEL_SPECS.manifestRef` (`lib/orchestrator/model-profiles.ts`) to
   `mf1:m25-nvfp4-v1@<cid>` (CID = `python -c "from shard import manifest as m; s,_=m.sha256_file('m25-nvfp4-v1.json'); print(m.cidv1_raw(s))"`,
   also from the shard checkout root),
   and point `SWARM_SEED_ADDRS` at ≥1 always-on full-model seed box.
   **Relay half (P0-#3, daemon side BUILT 2026-07-20):** the daemon resolves `/relays.json` off the
   orchestrator origin at enroll (validated — a malformed entry would log.Fatalf every sidecar, so
   bad entries are dropped loudly; env `C0MPUTE_SHARD_RELAYS` outranks), caches it, and passes
   `-relays` on every sidecar boot. `public/relays.json` ships EMPTY (git carries no public IPs);
   the launch deploy fills it with the operator relays' multiaddrs (systemd `shard-relay.service`
   boxes running `sidecar -relay -quic`; addrs in the ops notes).

**WSL2 turnkey (P1-#3) — daemon side BUILT 2026-07-21.** The two hard blockers were the sidecar
release (now published, sidecar-v0.1.0) and the npm publish (below). `scripts/wsl-setup.sh` (one
bootstrap: git + Node 20 + Python 3.11 → `npx @c0mpute/worker --mode shard`) + `c0mpute-worker/
WINDOWS.md` (WSL install, Windows NVIDIA driver, mirrored networking, one command) make a Windows
stranger's join turnkey. **Remaining:** (a) `npm publish @c0mpute/worker` at ≥2.8.3 — LEYTEN's npm
creds (the bootstrap calls `npx @c0mpute/worker@latest`); (b) one end-to-end smoke from the Ghent
home box (the only step that genuinely needs Windows hardware).
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

- **The security parameter is WHAT YOU PAY FOR, not whether entry is open.** io.net's disaster
  was paying an airdrop for *claimed idle capacity* (reward decoupled from verified work) — not
  that joining was permissionless. Open entry is fine; paying for anything other than
  measured/verified work is the hole. Our design is already on the right side twice over:
  admission is a MEASURED capability function (never self-reported metadata — same insight as
  Nosana/Chutes' mandatory benchmark), and pay is a cut of REAL demand for VERIFIED served
  tokens (no supply subsidy). So we keep fully-permissionless entry AND avoid the io.net failure
  — the two are not in tension. What replaces the admission gate as the sybil brake is per-job
  verification (spot-check) + the rake; both must be live at launch (§3.2).
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

## 3. leyten's decisions (DECIDED 2026-07-12)

1. **Earnings — BUILD THE BILLED GATEWAY IN c0mpute so it inherits the split; shard only
   supplies verified work-facts (leyten 2026-07-12).** The split is NOT flat 70/30 (that was an
   error): **70/25/5 base, 80/15/5 boosted** (worker / treasury / referrer) —
   `WORKER_REVENUE_SHARE 0.7`, `WORKER_STAKED_REVENUE_SHARE 0.8` for a worker staking ≥500k ZERO
   held 24h, `REFERRAL_REVENUE_SHARE 0.05`; the boost eats the TREASURY margin, not other
   workers. Treasury margin → buyback pool → 50/50 buy+burn $ZERO / pay stakers USDC
   (`POOL_BURN_SPLIT 0.5`). **The architecture IS the safety mechanism:** shard must NEVER compute
   a split — it would reference ZERO stake / referral, a network concern the engine can't know
   (boundary law). shard emits verified work-facts ("these pubkeys served these layer ranges,
   receipts prove it"); c0mpute owns the money math via the EXISTING
   `getWorkerRevenueShare(privyUserId)` (→0.7/0.8 by stake) + `recordEarning(...)` that
   whole-model jobs already use (orchestrator.ts:604/719/1353), and the shard hook is ALREADY
   stubbed at orchestrator.ts:190 ("Per-shard credit for a settled swarm job. Turning a stage's
   token share into a recordEarning()"). Pay-by-layers (#16) = per stage `layer_fraction ×
   job_credits`, then `recordEarning(..., revenueShare: getWorkerRevenueShare(stage.account))` per
   stage — a staked 80% stage next to base 70% stages resolves per-worker automatically, and the
   split can never go stale because it is never re-implemented. This also DEMOTES shard's
   m25_gateway from public front door to an internal coordinator endpoint (closes the
   naked-unauthed-gateway hole, adversary #1) and closes the console.log `recordSwarmStageEarning`
   stub. Wash-safety inherited: only DEMAND-side subsidies, hard-capped (FREE_SUBSIDY_DAILY_CAP_USD,
   Venice staker-allowance), NO supply-side subsidy — workers only earn a cut of money a user
   actually spent, so self-dealing loses the treasury margin every cycle (the rake IS the sybil
   tax). HARD GATE before USDC flows: bind pay to a client/server-verified token count, not the
   coordinator's word (INTEGRATION §6 — the only way an untrusted coordinator STEALS not just SEES).

2. **Launch shape — FULLY PERMISSIONLESS from day one** (leyten: "fully permissionless,
   self-sustaining, decentralized, torrent-like"). NOT a gated phase-1. This is consistent with
   what we already built: **admission is a capability function, never an identity/permission
   gate** — `derive_role` measures physics (fast-kernel, layers, RTT, uplink) and assigns a
   role or `reject`-only-if-physically-useless; a fresh key with a real GPU serves immediately,
   no reputation, no stake, no allowlist. The sybil defense is therefore NOT admission-gating —
   it is per-JOB economics (rake makes self-deal unprofitable) + per-JOB verification
   (spot-check makes garbage unpaid). Consequence of removing the gate: leg 8.7 (spot-check
   scheduler + ≥1 auditor) moves to day-one critical path — it is the load-bearing defense now,
   not admission. Note this makes the key-rotation "multiplier" (adversary #10) largely
   dissolve: because defense is per-interaction not per-identity, rotating keys buys the
   attacker nothing (each fresh key still does real unpaid work / still loses the rake).
   REPUTATION is a non-load-bearing optimization only: it tunes spot-check FREQUENCY + high-
   value-seat preference against MEASURED misbehavior; unproven starts checked-often, earns a
   lighter touch with a track record; a rotator just permanently pays the newcomer check-rate.
   STAKE gates nothing at launch — the only trust-required tier (boundary/coordinator privacy
   pinning) is decided-OFF (prompt privacy = accepted PoC limitation). "Fully decentralized" =
   the placement M1→M4 road; LAUNCH = M1 (server initiates, every decision signed +
   recomputable by anyone), not M4 — promising no-decider-at-all on day one would be a lie.

3. **Free playground** (still to size): budget + time-box + rate limits — the demand magnet
   (Chutes/Hyperbolic pattern), planned as a marketing burn with an exit. Reuse c0mpute's
   existing capped free-prompt lane.
4. **Standing network cost** (still to decide): who funds seed boxes + the auditor node
   (~$2.5-3k/mo on vast-class supply for one ring 24/7) vs demo-window operation until real
   permissionless supply arrives. Self-sustaining is the goal (the 30% rake funds
   auditor+bootstrap), but bootstrap supply precedes rake.
5. Auto-update key custody/staging; seeding-default consent (NODE_DAEMON §7). DEFAULT posture:
   auto-update off/manual, publisher keys pinned in the shipped daemon, weights key ≠ runtime key.

## 4. Sizing (honest)

Leg 8 items 1/2/3/5/6/7/8 are each days-class (the mechanisms exist; the work is wiring +
one scheduler + one allowlist + one table + one page). Item 4 (authed API → ring submit path)
is the week-class piece. **Leg 8 ≈ 2-4 focused sessions.** Leg 6's remainder is
hardware-gated, not effort-gated. Leg 7 is the daemon build (worker shard mode + runtime
artifact pipeline + shard.stage) ≈ 2-3 sessions. Nothing on this list is research-shaped;
it is all known-mechanism engineering.

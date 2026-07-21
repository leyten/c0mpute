# 🚨 Launch-Day Playbook — failure modes → pre-staged responses

> The premise: **there WILL be bugs on launch day.** This is the pre-mortem — every failure mode we
> can foresee, its live symptom, the one-line diagnosis, and the fix that's already staged so we
> respond in minutes, not hours. Ordered by likelihood × blast-radius. Keep this open during launch.
>
> _Owner: on-call (Kloot drives, leyten decides spend/rollback). Last updated 2026-07-21._

---

## 0. Pre-flight (the morning of — do NOT skip)
- [ ] **Orchestrator health:** `curl -s $ORCH/api/network | jq .stats` returns live counters; map at shard.c0mpute.ai renders.
- [ ] **Relays up:** `systemctl is-active shard-relay` on both relay boxes = active; `journalctl -u shard-relay -n2` shows the ADDR lines. Reservation smoke from a throwaway sidecar (see `launch-relays-live` memory).
- [ ] **Manifest published:** `curl -s $ORCH/manifests/m25-nvfp4-v1.json | jq .publisher_pubkey` == the baked `MANIFEST_PUBKEY`; the CID matches `MODEL_SPECS.manifestRef`.
- [ ] **`relays.json` filled:** `curl -s $ORCH/relays.json | jq '.relays|length'` ≥ 2.
- [ ] **Sidecar release:** `curl -sIL .../sidecar-v0.1.0/sidecar-linux-amd64 | head -1` = 200; sha matches `SIDECAR_SHA256`.
- [ ] **npm published:** `npx @c0mpute/worker@latest --mode shard --help` runs (version ≥ 2.8.3).
- [ ] **Auditor box:** at least one we-run auditor announced (reputation/spot-check depends on it).
- [ ] **Kill-switch rehearsed:** know how to flip `SWARM_PAYOUT_ENABLED=0`, take the swarm model out of `mapModel`, and drop `/relays.json` to `[]` — each is a one-line revert.
- [ ] **Dead-man switch armed** if any ops boxes are rented (pin iids, heartbeat cron).

---

## 1. 🔴 No ring ever forms (highest blast radius)
**Symptom:** strangers' daemons announce (map dots appear) but `c0mpute-swarm` never becomes available; `/api/v1/models` shows it down; requests 503 + refund.
**Diagnose:** orchestrator log `not forming minimax-m2.5: N candidates < min M` → not enough boxes hold enough VRAM for 62 layers. Or `planner: pool can't hold` → placement can't fit.
**Fix (staged):**
- Lower the bar: seed the pool with **our own boxes** (the operator seed box already runs `sidecar -seed`; bring up 2-3 GPU boxes running the daemon so a ring always forms). This is the single most important launch-day lever — **have 4-6 of our own 5090 daemons joined from minute zero** so the network is never empty.
- If placement mis-sizes: `minStages` in `MODEL_SPECS` is the floor; the planner seam decides k. Check the profile `cap_layers`/`layer_vram_mb` against real card VRAM.
**Prevention:** the ring session (this session's capstone) validates real formation before launch.

## 2. 🔴 Requests dispatch but never stream a token
**Symptom:** `job:submit` accepted, `job:processing`, then timeout → refund. No `job:token`.
**Diagnose:** the swarm formed but the coordinator can't drive it. Head-daemon log: `coordinator not running` / `return roundtrip never completed` (the head↔tail return tunnel is down) / `stall-watchdog` kills.
**Fix (staged):**
- Return-tunnel failure = the head can't reach the tail's sidecar. Usually NAT on the tail. **The relay auto-discovery + DCUtR should fix this**; if a specific tail is unreachable, it churns out and the ring re-forms (P0-#6 self-heal) from other supply.
- Persistent coordinator stalls = **P11 restart-degraded already fires** (relaunches EAGLE-off). If EVEN degraded stalls, the L3 backstop os._exit → daemon restart → churn re-form.
**Nuclear:** set `M25_EAGLE=0` fleet-wide via the daemon env (kills the speculative lever globally → slower but rock-solid plain rings).

## 3. 🟠 Weight pull fails / is glacially slow
**Symptom:** daemons stuck in `pulling`; `swarm:ready` never fires; map dots stay amber.
**Diagnose:** daemon `[pull]` log — `SHARD_FETCH_FATAL` (verification failure: CID/signature/model mismatch → a REAL supply-chain problem, do NOT wave it through) vs slow mirror (140 GB from HF over a thin uplink).
**Fix (staged):**
- Slow-but-working: standby seeding means the 2nd+ joiner pulls from **peers**, not the mirror — the operator seed box + early joiners carry it. First joiner is mirror-bound (expected). Patience, not panic.
- `SHARD_FETCH_FATAL content id mismatch` / `publisher pubkey` → the published manifest doc and the baked pin **disagree**. This is a deploy bug: re-check `public/manifests/*.json` vs `MANIFEST_PUBKEY` + the `mf1:` CID. Fail-closed is CORRECT — never disable the pin to "get unblocked."
**Prevention:** pre-flight manifest check (§0).

## 4. 🟠 A cheater / bad node serves garbage
**Symptom:** a stage returns plausible-but-wrong activations; users get garbage completions from some rings.
**Diagnose:** spot-check verdicts in the orchestrator log (`spot-check … FAILED cosine …`). If NO spot-checks are running → the reputation oracle/auditor isn't wired (see P1-#4 item 1).
**Fix (staged):**
- The challenge probe door + spot-check + degrade-on-fail are built; the auditor must be **live** (pre-flight §0). A failed spot-check degrades the swarm + strikes reputation automatically.
- **Threshold caution:** the cosine threshold (0.99) is validated in shadow-mode; if honest cross-vendor nodes false-fail, RAISE the tolerance before ejecting honest operators (a false-eject is worse than a missed cheat at launch). Shadow-mode first weeks: log verdicts, don't strike, watch the honest distribution.

## 5. 🟠 The naked cost / DoS: a laptop drains the free tier
**Symptom:** request volume spikes from few keys; treasury subsidy burns fast.
**Diagnose:** `/api/v1/chat/completions` auth + per-key rate-limit + credit gate are inherited from the HTTP front door (the swarm reuses them). Check the rate-limit + free-prompt caps are ON for the swarm model.
**Fix (staged):** the swarm model routes through the SAME authed metered path (P1-#4 item 3) — keys, quotas, credit charge (10cr/pro tier) all apply. If a specific key abuses, revoke it. `maxNew` is clamped to 512 server-side (per-token billing is Phase 2, so a flat charge caps damage).

## 6. 🟡 Map shows nothing / wrong state
**Symptom:** globe empty or stale while rings serve.
**Diagnose:** `/api/network` feed generator (5-min timer) vs the live latch. The map hot-swaps sim→real on a fresh non-empty feed.
**Fix:** cosmetic, never blocks serving. Restart `c0mpute-networkmap` timer; the sim fallback is the safe default (never an empty globe).

## 7. 🟡 A stranger on Windows/WSL2 can't join
**Symptom:** WSL user reports the one-liner fails.
**Diagnose:** most likely the toolchain gate (py3.11 on Ubuntu 22.04, no git/node) or the sidecar (no Go fallback needed now the release is published).
**Fix (staged):** point them at `docs/WINDOWS.md` + the `wsl-setup.sh` bootstrap (installs the toolchain). Mirrored networking is a perf upgrade, not a requirement — relayed still serves.

## 8. 🟡 Churn storm — mass simultaneous joins/leaves
**Symptom:** rings form and dissolve rapidly; thrash.
**Diagnose:** the auto-form debounce batches a join burst; churn self-heal re-forms on death. A storm could thrash formation.
**Fix:** the debounce (`autoFormDebounceMs`) already batches; if thrashing, raise it. Self-heal is proven (P0-#6). Worst case is churn, not outage.

---

## The three one-line kill-switches (know these cold)
1. **Take the swarm offline cleanly:** remove `minimax-m2.5`/`c0mpute-swarm` from `mapModel` → new requests 400 "unknown model" (existing whole-model tiers unaffected). Deploy.
2. **Disable payouts:** `SWARM_PAYOUT_ENABLED=0` → serving continues, settlement books nothing (no bad payments during a bug).
3. **Force plain rings:** `M25_EAGLE=0` in the daemon fleet env → drops the speculative lever globally (slower, maximally reliable).

## Rollback posture
Everything swarm-side is **dormant behind flags until launch** (pay-model gated, map latched, swarm model reachable only once `mapModel` ships it). Launch = flip the flags. A bad launch = flip them back; the whole-model network (pro/max tiers) is entirely independent and unaffected. **The blast radius of a swarm bug is contained to the swarm model.** That containment is the deepest mitigation.

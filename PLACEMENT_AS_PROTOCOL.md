# Placement as protocol — how the network, not an operator, forms swarms

> Design doc (2026-07-12). Panel: three design angles + adversarial verification; every claim below
> was checked against the code and the skeptic's report — nothing here cites unbuilt machinery as a
> shipped safety property. Status: DESIGN. The build list is §9; leyten's forks are §10.
> Companions: `NETWORK_ARCHITECTURE.md` (the lifecycle this slots into, §3/§5),
> `PERMISSIONLESS_LOOP.md` (the loop as built), shard `docs/ADMISSION_SPEC.md` (measured admission).

## 0. The three levels, and where we are

1. **Operator-driven** (`ring_up` hand-planning) — benchmark harness only. Never the product path.
2. **Automatic-but-centralized** — TODAY: announce → admit → place → form works end-to-end
   (SwarmManager + `shard.plan` over the stdio seam, live-proven 2026-07-12 with a hetero pool),
   but ONE placement brain decides.
3. **Protocol** — the goal: placement dissolves into signed records + a canonical deterministic
   function any party recomputes. No decider.

The key fact making level 3 cheap: `shard.probe.derive_role` and `shard.plan.plan_ring` →
`select_ring` are ALREADY pure functions of measurements. What's missing is not physics — it's
record formats, a determinism contract, and honest answers about who is trusted for what.

## 1. The trust thesis (the spine of this design)

**Determinism relocates trust; it does not remove it.** A recomputable plan proves "this ring is
the correct function of THESE inputs." The adversary therefore attacks (a) the input set and (b)
the measurements. Every mechanism below exists to protect one of those two, and the design's spine
is the three rules the threat analysis converged on:

- **Capability records are HINTS, never trusted placement inputs.** They shortlist candidates.
  Everything that prices or places a ring is **re-measured at formation time** by parties with
  skin in the game.
- **Member-side verify-and-sign is the load-bearing check.** A node recomputes the plan and probes
  its OWN would-be neighbours before signing; a fabricated or eclipsed ring dies at the sign step
  because the party who'd be harmed refuses. (This is buildable today from existing pure functions.)
- **Demand-side signature is the legitimacy anchor.** There is no abstract "canonical ring" —
  a ring is economically real when a paying client signs a job to it. Split-view attacks can mint
  parallel "valid" rings; they cannot mint parallel paying clients.

## 2. The records (transport for measurements — not the trust itself)

All records reuse shard's existing canonical-JSON ed25519 signing (`receipt._canonical`) and CIDv1
convention (`manifest.cidv1_raw`); one node key signs a node's announcements, co-signatures, and
receipts (the key `node-bind` already binds to an account).

**CapabilityAnnouncement `shard-cap/1`** — {peer_id, pubkey, seq, issued_at, ttl_s, model_id,
addrs, cap_gpu (total_vram_mb, footprint_mb_per_layer, load_peak_extra_mb, layer_ms,
has_fast_kernel, backend, measured_at), cap_net (uplink_mbps, nat_dialable, disk_free_gb,
measured_at, attestations[]), stake_ref, sig}.
- GPU half: self-measured, trust-then-punish (unchanged from ADMISSION_SPEC v0 — overstate and the
  load OOMs you out; understate and receipts expose you; `shard.challenge` recomputes on demand).
- Net half: receiver-signed observations (probe `--serve` replies gain a signature — small extend).
- Freshness split: cap_gpu ~24h, cap_net ~30min; **readers enforce** `min(record.expires,
  now + PROTOCOL_MAX_TTL)` — a record's self-set expiry is never trusted. Free VRAM is NEVER read
  from a record; formation re-reads it live.
- DHT: `Provide(cid("shard/cap/"+model_id+"/"+geo_bucket))` on the existing sidecar kad host
  (the blockx re-provide loop, reused verbatim); the record itself is fetched from its owner over
  a tiny `/shard/cap/1.0.0` protocol — dialable-and-alive is itself signal.

**FormationProposal `shard-form-proposal/1`** — {initiator, model_id, function pin
{name: shard.form, version, profile_cid, spec_cid}, announcement CIDs + input_root, rtt_edges
(co-signed, §3), slack, privacy, nonce, ts, sig}. The engine profile/spec constants become
content-addressed inputs: the living spec keeps revising numbers without making old rings
unverifiable.

**RingRecord `shard-ring/1`** — {ring_id = cid({proposal_id, plan}), proposal_id, plan verbatim,
plan_hash, members[{peer_id, stage, lo, hi, sig-over-ring_id}], gateway addrs, formed_at}.
Verification is literal: fetch → verify inputs → recompute `shard.form` → byte-compare plan_hash →
check member sigs tile every stage. **Settle = join(RingRecord, receipts)** — paying correctly
requires no placement authority.

## 3. Measurements: who measures what (the three-way split)

The panel's one genuine internal contradiction, resolved:

| Quantity | Source at formation | Why |
|---|---|---|
| Inter-member RTT `L[i][j]` (dominates step_ms) | **Co-signed member edges**, measured during formation among the shortlist; `rtt[i][j] = max(claim_ij, claim_ji)`; a missing/refused edge triggers re-probe-or-drop-the-pair (never a silent 9000 ms poison) | Only the members CAN measure it; max() kills one-sided inflation |
| Candidate uplink, dialability, coordinator-hop RTT | **Formation-time probe by an assigned disinterested peer** — assignment by the initiator at level 2; by VRF draw over the aged+staked reputation set at level 3 | Receiver-timing is void if the receiver colludes; the assigner must not be the candidate |
| GPU capability (footprint, layers, layer_ms, fast-kernel) | Node's own probe receipt (hint) + trust-then-punish + on-suspicion `shard.challenge` recompute | Lying is self-defeating (OOM) or receipt-visible (slow) |
| Free VRAM | Live read at formation | Drifts by the minute |

**Deliberately NOT adopted:** deriving the probe set from kad-distance rendezvous
(`K closest to sha256(peer_id‖epoch)`). The skeptic's grind analysis: an adversary owning a 1%
arc of the keyspace grinds a landing peer_id in ~100 hashes, and verifying "the probe set was
correct" needs a consistent DHT view — exactly what this design refuses to assume. Rendezvous
raises the bar against lazy self-selection only; the real anti-collusion property comes from the
VRF-over-aged-staked draw, which is why probe assignment decentralizes LAST (§8, M3).

**Accountability gap to close in the same breath:** receipts attest layer coverage, not realized
latency — an understated RTT that wins a seat is otherwise free. Settlement therefore records
**realized step_ms vs the plan's prediction** (committed tokens / wall clock — both already known
at settle) as a reputation signal on every member of the ring.

## 4. The canonical function — `shard.form` (the determinism contract)

A thin pure wrapper over `plan_ring` (~150 LOC + CLI `python3 -m shard.form [--verify]`):

1. Sort announcements by peer_id bytes → int indices (node keys inside the function are ints, by law).
2. Build the RTT matrix from co-signed edges (§3), missing-pair rule applied.
3. Call `plan_ring` with the pinned profile/spec (by CID). Emit plan + `plan_hash` (sha256 of
   canonical JSON).

**The contract is the reference implementation, byte-for-byte — not "the algorithm."** Two honest
verifiers agree because they run the same pure-Python code (no BLAS in the call graph; IEEE-754
`+ * /` on doubles is bit-stable given identical order) over the same declared, content-addressed
input set. A TypeScript or Go re-implementation is explicitly NOT a verifier; c0mpute already
drives shard by subprocess, which is the right shape.

**Determinism work the skeptic actually found (do these, skip the theater):**
- `topology.py` builds one search-path set that iterates (`must`/`keep` union) — replace with
  `sorted(...)`; audit for any other set-iteration on the search path.
- Tie-breaks are "first found under strict `<`" — make them explicit: rank ties resolve by
  canonical index tuple, never exploration order.
- CI = golden proposal→plan_hash vectors + a cross-CPython-version matrix run. (A PYTHONHASHSEED
  A/B is a no-op here — node keys are ints — and would give false green.)

## 5. Formation: trigger, cut, co-sign

- **Trigger**: a demand event (a gateway holding a funded request and no ring under its load bar),
  or a maintenance tick from a degraded ring. Initiation is permissionless; anti-spam is an
  economics knob (§10).
- **The cut is initiator-declared, member-verified.** No pool-wide snapshot consensus: the
  initiator publishes the explicit announcement-CID set; only the PLACED nodes must agree, and
  they verify rather than trust.
- **Co-sign round**: each placed node independently (a) verifies every announcement (sig,
  reader-enforced freshness at proposal.ts), (b) verifies each RTT edge it is an endpoint of —
  it refuses a plan built on an edge it didn't sign, (c) recomputes `shard.form`, byte-compares
  plan_hash, (d) checks its own block fits its live VRAM. All green → sign ring_id. All N sigs
  within the window or no ring; retry with a fresh cut.
- **Liveness honesty (skeptic #2)**: the co-sign round is the CHEAP part — it precedes any weight
  pull; a failed round wastes signatures. The expensive failure is **warming abandonment**: all N
  sign, then a member vanishes during the multi-minute pull and N−1 nodes ate tens of GB for a
  ring that never pays. Mitigations, in order: pulled ranges are never wasted work (the node seeds
  what it verified and re-enters the pool warm — the torrent flywheel); formation-abandonment is a
  scored reputation event (`flake`) with backoff against re-selecting the same flaky
  attractive-cap node; a warming bond (stake slice escrowed at co-sign, forfeited on desertion) is
  the market-era fix (§10). 
- **Omission is not prevented, by design.** Remedies: permissionless initiation (form your own
  ring), and a signed contest record ("my fresh announcement was omitted; form_ring(S ∪ {me})
  predicts better step_ms") — cheap to verify, feeds initiator reputation, lets gateways prefer
  uncontested rings.

## 6. Living rings: epochs + churn (from the churn memo, with the settle fix)

- Ring config versioned by **epoch** (hash-chained records carrying pinned inputs + plan +
  countersigs). In-flight jobs close as epoch-scoped segments; resume = re-prefill of
  prompt+committed (the proven resume-file flow); KV is epoch-local; receipts gain `epoch` +
  `plan_hash` fields.
- **Failure detection is progress-gated, never latency-gated** (60 s WAN stalls are normal):
  coordinator observes zero-commit windows; successor suspicion is a report, never an action;
  the arbiter confirms with a probe dial-back (the existing nonce echo) before any bump.
  DEGRADED ≠ DEAD; timers calibrate to the ring's measured step_ms.
- Re-formation tiers: hot-standby promotion (~33 s, proven as heal_hot demo — to be lifted into a
  `set_next` engine seam) → replacement-in-place (same plan, one node swapped; pulls peers-first)
  → full re-plan scored with move cost (`plan_diff`).
- **Gapped-segment settle is NOT v0.** The proposal (accept a coverage gap when an epoch record
  names the dead stage) lets the accusers manufacture the evidence: a coordinator + a colluding
  replacement can declare an honest stage dead and capture its range's pay. Until eviction is
  contestable (the evicted node's own valid segment receipt fails the gap closed) AND the evidence
  set is provably disinterested, `verify_coverage` **stays fail-closed on any gap** — nobody is
  paid for a broken segment, which is the safer wrong answer.
- Dissolution: drain → final settle → **seeder handoff** (members must not be the last holders of
  their range; lame-duck seeding until ≥R providers exist) → terminal epoch.

## 7. What is honestly enforceable today (no vapor)

- **Equivocation (double-signing conflicting rings) is DETECTABLE** — two sigs over conflicting
  ring_ids is a portable proof — **and punishable only by reputation.** There is no slash path in
  the codebase; stake currently gates boundary roles and pays rewards, it is not escrowed against
  misbehavior. Economic slashing is a precondition delivered by the market fork (#16), not a v0
  property. No safety argument in this design leans on slashing.
- **The one-slot lease** (`nodeToSwarm`) prevents double-booking only while ONE control plane
  exists. Under open initiation the equivalent is "a node co-signs ≤1 concurrent placement per
  resource slot" — which, absent slashing, is enforced by the same reputation + demand-anchor
  logic (a double-booked node fails one ring's canary and eats the flake).
- **M1 transparency (§8) constrains the function, not the inputs.** A malicious operator can omit
  announcements, assign colluding probe peers, and still pass `--verify`. M1 catches bugs and
  accidental misplacement and creates the record substrate; operator-honesty arrives with M2/M3.

## 8. Migration (each step shippable, nothing thrown away)

- **M0 (today):** server probes at bind, plans, deploys. Live-proven incl. hetero placement.
- **M1 — verifiable-centralized (next):** every formation the server performs is emitted as
  signed FormationProposal + RingRecord CIDs; caps become signed shard-cap/1 records; anyone
  recomputes `shard.form --verify`. Scope stated honestly per §7.
- **M2 — open announcements:** sidecar `-announce` + `/shard/cap/1.0.0` + rendezvous Provide;
  the server's candidate discovery becomes a DHT read like anyone else's.
- **M3 — open initiation:** node agents grow verify-recompute-then-sign (the one genuinely new
  node-side behavior); contest records; probe assignment moves to VRF-over-aged-staked; **the
  market slots in here** — pricing decides which proposal a contended node signs (#16).
- **M4 — no decider:** demand-side initiation; records all the way down; c0mpute-the-company
  operates one gateway among many with zero protocol privilege.

## 9. Build list (engine seams; deps stay c0mpute → shard)

| Item | Where | Size |
|---|---|---|
| `shard.form` (form_ring / plan_hash / verify_formation + CLI + golden-vector CI) | shard | ~150 LOC + tests |
| topology determinism pass (de-set search path, explicit tie-breaks) | shard | small, subtle |
| `shard.announce` (sign/verify/CID records; `sign_observation` in probe --serve) | shard | small |
| sidecar `-announce`, `/shard/cap/1.0.0`, `/shard/ring/1.0.0` | shard sidecar | small |
| epoch + plan_hash fields in ReceiptSigner meta | shard | hours |
| `plan_diff`, `replace_stage` | shard | small |
| `stage_health` / `ring_progress` formalization; `set_next` (lift heal_hot) | shard | medium |
| realized-vs-predicted step_ms at settle → reputation signal | c0mpute | small |
| M1 record emission in SwarmManager | c0mpute | small |
| mesh_rtt lift from phase0 glue into `shard/` proper | shard | trivial |

Explicitly NOT built: gapped-segment settle (§6), slashing (§7), KV migration (restart-from-prompt
is the contract), epoch cut-hash gossip (only needed if placement must be a global truth — §10).

## 10. leyten's forks (surfaced, not decided)

1. **Is placement a global protocol truth or a per-transaction demand artifact?** The latter is
   this doc's default (demand-anchor); the former requires input-set consensus machinery (epoch
   cut-hashes) this design otherwise avoids. Decides how much of split-view must ever be solved.
2. **Is placement preference purchasable?** Does stake buy trust only (boundary/coordinator
   eligibility), or also queue priority at the seat tiebreak? Revenue lever AND centralization lever.
3. **Who is staked/trusted** (boundary, coordinator, auditor sets) + stake sizes per role. Recurs
   from every attack chapter; also the precondition for VRF probe assignment.
4. **Emissions/subsidy:** hard gate — no supply-side subsidy before the wash-trading design exists
   (a sybil ring serving itself farms any supply subsidy with valid receipts). Demand-side
   subsidies (stake→allowance) are wash-safe.
5. **Announce anti-spam:** permissionless vs bonded/rate-limited; who funds spot-check challenges.
6. **Standby + warming economics:** who pays warm-idle standby hours (decides 33 s vs 5 min
   failover); warming bond vs reputation-only for formation desertion.
7. **Dead-stage pay policy** on epoch bumps: forfeit (fail-closed default) vs pro-rata-by-challenge.
8. **Epoch authority timeline:** central bumper (v0 watcher) → member-quorum bumps — same
   governance fork as the self-optimizer (NETWORK_ARCHITECTURE §5/§10).

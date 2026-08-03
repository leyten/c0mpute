# c0mpute — Network Architecture

> **What this is:** the end-to-end architecture of the c0mpute *network* — how scattered, permissionless
> GPUs self-organize into swarms that serve models too big for any one card, and how the network keeps
> optimizing itself as nodes join and leave at will. This is the **control-plane / lifecycle** doc.
>
> **Boundary (the law, memory `shard-c0mpute-boundary`):** **Shard = the engine** (how *one swarm* serves
> inference fast over WAN: the pipeline runtime, transport, speculative decoding, verification primitives,
> per-node runtime). **c0mpute = the network** (how *thousands of nodes* become swarms: membership, weight
> distribution, placement, healing, self-optimization, economics). Deps point one way: c0mpute → shard.
> This doc is the c0mpute side. For the engine internals see `shard/docs/ARCHITECTURE.md`; for the
> public swarm explainer see `shard/docs/NETWORK.md`.
>
> **Status legend:** ✅ built · 🟡 designed (not built) · 🔬 open/research. Honest, not a larp.

---

## 0. The one-line model: torrent, but for compute

BitTorrent splits a file into content-addressed pieces; peers hold pieces and serve them to each other;
a `.torrent` manifest says what the pieces are and how they hash. **c0mpute is the same shape, but the
pieces are model *layers* and instead of downloading them you *run inference through them*.** No node holds
the whole model; no node is essential; the network heals around churn. That single analogy answers most of
the "how can this possibly work" questions — the answers are the torrent answers.

---

## 1. The actors

| Actor | What it is | Holds |
|---|---|---|
| **Node** | a volunteer GPU + the c0mpute client (worker + shard runtime + libp2p sidecar) | one **shard** of one model (a contiguous block of layers), or runs as a coordinator |
| **Swarm** | a set of nodes that together hold **one full copy** of a model and serve it as a pipeline/ring | collectively, all layers of the model |
| **Coordinator** | drives generation for a swarm: holds the draft model, runs spec-decode, emits receipts | **no** model layers (light — runnable on a modest node, placed in-region) |
| **Control plane** | the orchestrator/scheduler: forms swarms, places shards, heals churn, self-optimizes | no weights, no user data (so it can decentralize later) |
| **Requester** | a user/app sending an inference request | nothing — pays per token |

A model has **many swarms** (replicas) for throughput and resilience. Different models = different shard
sets coexisting on the same node pool.

---

## 2. The lifecycle of a GPU (this is the part that felt missing)

### a. Join — ✅ rails exist (one-line installer, `cwt_` worker tokens, libp2p)
The operator runs a one-line installer (same plug-and-play as today's c0mpute workers). The node:
1. starts the client, which **announces itself** on the libp2p DHT/gossip layer (Shard already uses libp2p);
2. advertises its **capabilities**: GPU model + VRAM, measured up/down bandwidth, geo/latency hints,
   and its **reputation** (carried from prior service; new nodes start at a probationary score).

Joining and leaving "whenever they want" is not an edge case to tolerate — it is the **normal operating
mode**. The whole design assumes continuous churn.

### b. Get a shard — weight install **is** a torrent — 🟡 (content-addressing ✅, P2P fetch 🟡)
The control plane assigns the node a **role**: *model X, layers `[lo,hi)`* (see §3 for how it picks). The
node then pulls **exactly those layers** — not the whole model:
- weights are **content-addressed** via the model **manifest** (memory `tensor-commitments-stance` — our
  weight-commitment is the `.torrent` of the model);
- it fetches its layer-blocks **peer-to-peer from other nodes already holding them** (fast path), falling
  back to a seeder/origin (HF) when no peer has them;
- it **verifies** every block's hash against the manifest before trusting it.

A node only ever stores its slice (~20 GB for a 5-stage M2.5), which is the entire reason a 24–32 GB
consumer card can participate in serving a 200B+ model.

### c. Join a swarm — ✅ engine ready, 🟡 auto-formation
The control plane slots the node into a swarm — a pipeline of shards that, end to end, form one full model
copy — choosing **low-latency neighbours** (§3). The node loads its weights ("warms"), connects to its
ring neighbours over Shard's transport, and signals **ready**. Activations then flow
`coordinator → stage 0 → … → tail → coordinator`, one loop per token.

### d. Serve — ✅ engine, ✅ metering rails
Requests run through the swarm. The node **earns per token its shard helped produce** (existing per-token
USDC metering). Every stage signs a receipt (activation hash-chain) so the work is auditable.

### e. Leave — ✅ failover proven, 🟡 full auto-heal
- **Graceful:** the node announces departure; the swarm promotes a **hot standby** or pulls a replica
  (hot-standby failover is already demonstrated — ~33 s vs ~131 s cold, 423 tokens preserved).
- **Ungraceful (crash/disappear):** heartbeat + a canary request detect it; the swarm re-routes to a
  standby/replica and **retries the in-flight request**. Because no node is essential and shards are
  replicated, a death is a re-route, not an outage.

---

## 3. Placement — which device gets which shard

The scheduler (`shard/scheduler.py` skeleton ✅; full policy 🟡) solves a **constrained fitting + balancing**
problem, continuously:

1. **Fit to VRAM (heterogeneous shard sizes).** Partition the layer stack so each block fits its node's
   VRAM. A 96 GB card takes a big block (or several shards); a 24 GB card takes a small one. The model is
   partitioned **adaptively to the hardware on hand**, not on a fixed split.
2. **Balance to *speed*, not just VRAM.** A pipeline runs at the speed of its **slowest** stage. So give
   faster GPUs *more* layers and slower GPUs *fewer*, so every stage takes ≈ equal wall-time. Straggler
   elimination is a first-class scheduling objective.
3. **Cluster by latency.** The WAN round-trip is *the* bottleneck (Shard's "one law"). Swarm members must be
   low-RTT to each other; the coordinator goes **in-region** (proven worth ~40 tok/s vs 25 on gpt-oss).
   Same-continent by policy.
4. **Privacy-aware pinning** (memory + `ARCHITECTURE.md` privacy section). A malicious middle node can
   reconstruct 35–59% of tokens from activations. So **pin the leaky boundary layers** (embedding + final
   layers) to operator-run/staked nodes; let untrusted volunteers hold only **deep middle** layers, which
   leak far less. Placement is privacy policy, not just performance.
5. **Reputation-aware.** High-reputation nodes get critical/boundary roles; new or flaky nodes get
   redundant, spot-checked, deep-middle roles until they earn trust.

---

## 4. Can a swarm run on different GPUs? — yes, by design

A swarm is a **pipeline of shards**; each shard runs on whatever GPU holds it. A single swarm can mix a
5090 (layers 0–12), a 4090 (13–22), a 3090 (23–30), a Blackwell card (31–…) — sized adaptively per §3.
The pipeline doesn't care about uniformity; each stage just computes its layers and streams activations on.

The rule is **heterogeneous compute, homogeneous weights + semantics**:
- every node serving model X uses the **same content-addressed weights** (so any swarm produces the same
  model);
- per-GPU kernels may differ (sm_120 vs sm_89, different quant kernels) but must be **numerically
  compatible**. This is exactly where **batch-invariance** and our **verification layer** matter — they let
  us trust a heterogeneous node's output. The per-node `ModelRuntime` interface (memory
  `engine-genericity-decision`, `shard/node.py`) abstracts execution so "what runs the layers" is pluggable
  per device while the ring/verification stays uniform. ✅ interface · 🟡 multi-arch coverage.

---

## 5. Self-optimization — the network's always-running job (🟡/🔬 — the hard, valuable part)

This is the control plane's continuous loop. Inputs: a live telemetry graph (RTT matrix, per-stage times,
load, reputation, supply/demand). Objective: **maximize served throughput × reliability ÷ cost**, subject to
privacy/trust constraints. It continuously:

- **Re-clusters topology** — as nodes join/leave and latencies drift, re-form swarms onto lower-RTT
  groupings; relocate coordinators in-region.
- **Re-balances shards** — re-partition to flatten stage times; evict/repair stragglers.
- **Scales** — spin up new swarms (replicas) when a model's queue grows; retire idle swarms; shift a node
  from an over-served model to an under-served one.
- **Batches** — aggregate requests across users onto a swarm (continuous batching, cores ✅) so the fixed
  WAN round-trip is amortized over B requests → multiples on **aggregate** throughput / lower $/token.
- **Routes** — send each request to the best swarm: least-loaded, lowest-latency to the *user*, and meeting
  the request's trust/privacy class.

**How the decisions get made — the genuinely open design fork (your call):**
- **(A) Central scheduler first.** The c0mpute orchestrator runs the optimizer. Pragmatic, ships fastest,
  holds no weights/keys so it decentralizes later as a clean follow-up (rotating/elected scheduler). This is
  what `ARCHITECTURE.md` currently assumes.
- **(B) Market as the optimizer.** Nodes *price* their compute; requests route to cheapest-adequate;
  supply/demand balances the network with no central planner. The market **is** the self-optimizer — the most
  decentralized end state, and it dovetails with the economics layer (§6). Hardest to get right.
- Likely path: **A → B** (central optimizer now, evolve toward a priced market), or a hybrid (gossip-based
  *local* improvement among neighbours + light global coordination). **Flagged as a decision for you.**

---

## 6. Trust: verification + economics (the moat — why permissionless is safe)

Permissionless only works if you can (a) catch a node that computes wrong/lies, and (b) make lying
unprofitable.

- **Verification** ✅ primitives: every stage emits a **signed receipt** (activation hash-chain, distinct
  GPU IDs, real latencies, output hash); the **lossless spec-decode** verify step structurally catches a
  stage whose outputs diverge; **spot-check recompute** re-runs a random block on a trusted node and compares.
  (Computation-commitment / ZK is step-6 / 🔬 — impractical at 100B+ today; economic verification carries us
  now, memory `tensor-commitments-stance`.)
- **Reputation** 🟡: a **graded** score per node (not the current binary canary — memory
  `c0mpute-reputation-needs-upgrade`), plus a layer-block spot-check so a *partial* node can be probed. Gates
  which roles a node may hold.
- **Economics** ✅ rails / 🟡 integration: nodes earn per token; requesters pay; **staking** buys trusted/
  boundary roles; **slashing** punishes detected misbehavior. Skin in the game is what makes open membership
  safe. (Treasury/key decentralization is its own track — `c0mpute/DECENTRALIZATION_DESIGN.md`.)

---

## 7. Privacy (the #1 product decision — leyten's call, flagged loud)

From `ARCHITECTURE.md`: untrusted middle nodes leak 35–59% of tokens from activations. Plan:
- **a. Boundary pinning** (core, §3.4) — keep the leaky embedding + final layers on trusted/staked nodes.
- **b. Trusted routing** (per-request option) — a request can demand vetted/staked nodes only, trading some
  decentralization for privacy on demand.
- **c. Activation obfuscation** (🔬) — invertible noise/permutation on each edge; measure quality cost.
- **d. Honest disclosure** — never assert "private" beyond what's hardened; ship the guarantee per phase.
Recommendation: **a + d** in the core, **b** as an option, **c** as research.

---

## 8. The layering, one more time (so it's unambiguous)

```
   Requester ─▶ c0mpute (NETWORK / control plane)            ← this doc
                 ├─ membership + DHT (join/leave, capabilities, reputation)
                 ├─ weight distribution (content-addressed, torrent P2P)
                 ├─ placement / scheduler (fit, balance, cluster, privacy-pin)
                 ├─ self-optimizer (re-cluster, re-balance, scale, batch, route)
                 ├─ economics (earn / pay / stake / slash) + reputation
                 └─ product surface (API, dashboard, payments)
                          │  forms + drives swarms using ↓
                 Shard (ENGINE / one swarm)                  ← shard/docs/ARCHITECTURE.md
                 ├─ per-node runtime (ModelRuntime; pluggable per GPU)
                 ├─ transport (encrypted point-to-point, no P2P/NCCL needed)
                 ├─ spec-decode coordinator (n-gram ⊕ EAGLE-3, lossless)
                 ├─ verification primitives (signed receipts, hash-chains)
                 └─ scheduler skeleton (layer fit / topology / heal)
```

Deps point **one way**: c0mpute → shard. A swarm is the unit Shard serves; the network is the swirl of
swarms c0mpute organizes.

---

## 9. Built vs designed vs open (honest status, 2026-06-30)

| Area | Status |
|---|---|
| One swarm serves M2.5 fast over WAN (engine) | ✅ ~12 tok/s reasoning hybrid, lossless, receipts |
| Heterogeneous shards, per-node runtime interface | ✅ interface · 🟡 multi-arch coverage |
| libp2p membership / announce | ✅ transport · 🟡 capability advertising + DHT registry |
| Weight distribution: content-addressed manifest | ✅ commitments · 🟡 **P2P torrent fetch** (today: HF pull) |
| Placement: VRAM-fit + topology + heal | ✅ skeleton + failover · 🟡 speed-balance, privacy-pin, auto-form |
| Churn healing (graceful + crash) | ✅ hot-standby failover · 🟡 full auto-heal under continuous churn |
| **Self-optimizer** (re-cluster/scale/route/batch) | 🟡/🔬 — **the central open build** |
| Verification (receipts, spot-check) | ✅ receipts + lossless verify · 🟡 graded reputation + block spot-check |
| Economics (earn/pay/stake/slash) | ✅ per-token metering · 🟡 staking/slashing/market integration |
| Privacy (boundary pinning, trusted routing) | 🟡 designed · 🔬 obfuscation |
| Decentralized scheduler / market | 🟡 central-first by design · 🔬 market end-state |

---

## 10. The open decisions for leyten (don't let me pick these silently)

1. **Self-optimizer governance:** central scheduler first (A) vs market-as-optimizer (B) vs hybrid (§5).
2. **Privacy stance / "private" claim** — boundary-pin-only vs trusted-routing default vs obfuscation R&D (§7).
3. **Permissionless from day one vs curated-ring betanet first** — the betanet can launch as a *curated*
   swarm (we run the boxes, public hits the endpoint) and open to outside GPUs after the engine is proven in
   the wild. (Curated PoC is ~2–3 sessions out; permissionless join is the milestone after.)
4. **How aggressive the self-optimizer is at launch** — static swarms first, or continuous re-balancing from
   the start.

---

## 11. Placement as protocol (2026-07-12 design — see PLACEMENT_AS_PROTOCOL.md)

Formation has three levels: operator-driven (`ring_up`, benchmark harness only) → automatic-but-
centralized (today's loop: announce→admit→place→form works, live-proven with a hetero pool, but ONE
placement brain) → protocol (the goal: signed capability records + a canonical deterministic
`shard.form` any party recomputes — no decider). The full design, panel-reviewed + adversarially
verified, lives in `PLACEMENT_AS_PROTOCOL.md` (PR #21): records-as-hints + re-measure-at-formation +
member verify-and-sign + demand-side-signature-as-anchor; M0→M4 migration; the build list; and the
§10-style leyten forks (global-truth vs demand-artifact placement, purchasable placement preference,
who is staked/trusted, the emissions wash-trading gate, announce anti-spam, standby/warming
economics, dead-stage pay, epoch authority). Intersects c0mpute #16 at exactly one point: which
proposal a contended node co-signs under scarcity = pricing = the market.

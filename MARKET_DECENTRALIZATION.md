# Market Decentralization — from central orchestrator to a compute market

Status: DESIGN (v1). Decides *how* the decided end-state — **the market IS the self-optimizer**
(NETWORK_ARCHITECTURE §5B/§10.1, option B) — gets built without breaking the proven loop.
Companion to `PERMISSIONLESS_LOOP.md` (the mechanism this decentralizes) and
`NETWORK_ARCHITECTURE.md` (the frame). Nothing here is built yet except where marked.

---

## 0. The organizing idea: validity is checked locally, optimality needs no referee

Every control-plane function splits into a **validity** question (does this ring tile the model?
are these receipts signed? did I get paid?) and an **optimality** question (is this the
cheapest/fastest ring?). Validity must be locally checkable by the party it affects — never by
consensus. Optimality needs no agreement at all: a slow or overpriced ring earns less and dies.
That is BitTorrent's trick — nobody votes on which peers you use; you just verify the pieces.

The codebase is unusually ready for this because the two hard decisions are already **pure,
stateless, JSON-in/out subprocesses**: placement (`shard.plan` → `select_ring`) and settlement
verdict (`shard.verify` → `verify_coverage`). Same inputs ⇒ same answer, on any box. Receipts are
self-verifying ed25519 objects. The serving ring already runs peer-to-peer and survives
orchestrator death — only announce/form/settle/pay stop. Decentralizing = moving the *inputs*
into public, signed, content-addressed records and demoting the orchestrator from authority to
participant. The only genuinely central thing left at the end is money custody.

## 1. Where centralization actually lives today (code-cited)

| Component | Code | State held | Portable? | If it lies / dies |
|---|---|---|---|---|
| Announce/discovery | `swarm-loop.ts` socket `node:announce` | in-mem candidate pool | yes (ephemeral) | dies: no new swarms; rings keep serving |
| Admission | `swarm.ts::admit` (VRAM floor) + ban list (db) | ban/strike table | policy yes; state no | lies: censors/admits at will |
| RTT matrix | **unbuilt** (demo uses sim) | — | greenfield | fabricated RTT steers placement |
| Placement | `shard.plan` subprocess | none | **yes — pure fn** | only via fake inputs |
| Assignment | `swarm:assign` emit; nodes obey unverified | swarm maps (in-mem) | yes (derivable) | nodes can't check the plan was honest |
| Coordinator pick | `plan.head` (deterministic centrality) | none | yes | head sees prompts + submits settlement |
| Receipt collection | coordinator (already a peer) | none | yes | withholding = nobody paid (grief, not theft) |
| Settle verdict | `shard.verify` subprocess | `settled` set — **in-mem only** | **yes — pure fn** | refuse-to-pay censorship; cannot forge |
| Pay / custody | `recordStageEarning` → credits DB | the money ledger | **no** | THE hard one |
| Reputation | graded scores (db) | scores | evidence yes; aggregate no | kicks honest / shields cheaters |
| Manifest root | signed manifest + pinned pubkey | catalog pin | yes (a .torrent's role) | wrong model served; never corrupt weights |
| Bootstrap | orchestrator URL / sidecar addrs | an address list | trivially | new nodes can't find the net |

Two latent bugs this mapping surfaced (fix in stage 4): (a) the `settled` replay journal is
in-memory — the moment swarm state outlives the process, a restart re-opens double-pay; (b)
`admit()` trusts self-reported `freeVramMb` — fine only while placement + receipts punish liars,
must stay documented as claim-not-proof until the admission probe lands.

## 2. The market mechanism

**Pricing unit — the ask is µUSD per layer-token**, posted per `(model, manifest)`. It composes
linearly into the client-visible price (`price/token = Σ askᵢ·layersᵢ + coordinator fee`) and it
is exactly the shape `splitTokens` already pays (weights = layers), so the settlement code needs
no change to price-weight it. Rejected: per-GB-VRAM (pays capacity, not work — wrong incentive),
flat per-shard (breaks under heterogeneous block sizes).

**The slow-node externality is priced by the adequacy floor, not the unit.** Pay is per token,
not per hour — a node that halves ring throughput halves everyone's revenue including its own.
Formation only considers rings whose predicted speed clears the swarm-class floor (the 20 tok/s
bar lives in the batched/draftable regime per `shard/docs/M25_ENGINE.md`); below the floor no ask
is cheap enough, above it price competition rules. Slow-cheap supply that can't clear any
adequate ring is absorbed by the off-ring markets: seeding (per GB served — the torrent fetch
path), spot-check verification, standby. `select_ring`'s relegation roles get a wage instead of $0.

**Clearing — posted price, no order book, no auctioneer.** Asks travel in the (signed) announce
record. Ring formation = a deterministic, auditable matching over `(asks, RTT probes)`: greedy
cheapest-adequate — take the cheapest coverable subset, run the *unchanged* `shard.plan`, evict
the binding node and admit the next-cheapest while the plan misses the floor. Deterministic
matching is what replaces the trusted auctioneer: every invited node can recompute the match
before signing. Sealed-bid auctions rejected: thin regional pools degenerate to posted price with
extra steps, and combinatorial winner determination is unverifiable by losers. Warm inventory
(`heldRanges` — verified ranges already on disk) outranks a cheaper cold ask; holding a rare
range makes your ask clear more often, which is the torrent economics of shard supply.

**The RingCharter** is the market's contract object — plan + frozen prices + every member's
signature (signing = accepting the posted price at form time; re-pricing = re-forming at an epoch
boundary):

```jsonc
{ "swarm": "h(body)", "manifest": "bafy…", "epoch": 0,
  "order": ["peerA", …], "blocks": {"peerA": [0,14], …},
  "coordinator": "peerA", "standbys": {"peerC": [14,27]},
  "asks": {"peerA": 12, …}, "coordFee": 3, "pricePerToken": 660,
  "adequacyFloor": {"regime": "batched", "tokS": 20},
  "planInputsHash": "h(pool+rtt snapshot)", "member_sigs": {…} }
```

Each invitee checks only its own locally verifiable facts before signing: my block fits my VRAM
and floor price; the assignment tiles `[0, n_layers)` with no duplicates; I probed my charter
neighbours myself; the coordinator + fee are stated. A suboptimal ring is *valid* — it just
loses jobs. One live charter per GPU (the existing `nodeToSwarm` one-slot rule) is the
anti-double-book lease.

**Price dynamics** — node-local utilization controller, epoch-clocked (~10 min): utilization
above target ⇒ ask +5%, below ⇒ −5%, floor = the node's own cost basis (its business, not
protocol). Re-forms trigger only when a rival charter is ≥15% cheaper (churn damping). Publish
per-region price telemetry (the "compute ticker") — a regional premium is the signal that
attracts supply; don't cap it, display it.

**Cheating and price are orthogonal.** Lying about price is impossible (you are paid your frozen
ask). Lying about physics (fake layer_ms/VRAM to win a slot) is caught ex-ante by the admission
probe and ex-post by receipts carrying real latencies — a stage running far over its advertised
speed takes a reputation flake and the ring re-forms without it. Wrong output is already handled
(receipts + auditor spot-check + graded reputation).

## 3. The distributed protocol (libp2p; the sidecar is the substrate)

The Go sidecar (`shard/sidecar/`) already runs on every node and — as of the P2P propagation
work — already carries a kad-DHT (`/shard` prefix) for shard provider records. Discovery,
capability, probing and charters are the same machinery pointed at control-plane records. Control
logic stays in the TS node-agent/client (policy); the sidecar stays peers-and-bytes; the Python
seams stay pure.

- **Discovery**: DHT rendezvous keys `shard/v1/model/<manifest-cid>` (candidate pool),
  `…/seed/<layer-bucket>` (who holds which ranges — shared with the weight-fetch), optional
  `shard/v1/region/<region>/…`. The DHT answers *who*; a signed **capability record** fetched
  live from the peer (`/shard/cap/1.0.0`, pushed on gossipsub when price/load changes) answers
  *what*: `{gpu, vram_free, layer_ms, up_mbps, subnet, region, roles, held, ask, expires, sig}`.
  Records are ed25519-bound to the PeerId (the sidecar's `-prove`/`-verify` path is exactly this
  check). TTL ~30 min.
- **Sybil resistance, honestly scoped**: identity is free; seats are not. A new PeerId must pass
  a `shard.challenge` block-recompute probe (minting N identities costs N real GPU runs, and the
  probe yields *measured* layer_ms — never trust the self-report), RTT triangulation collapses
  co-located sybils (pairwise ≈0ms + shared /24 ⇒ one slot), and zero-start reputation gates new
  ids to standby/seeder first. A funded adversary with real GPUs is indistinguishable from
  supply — acceptable: doing the work correctly IS the service; receipts catch doing it wrong.
- **RTT without a center** (`/shard/probe/1.0.0`): the former hands candidates a peer list; each
  pings the others (the sidecar echo self-test is the primitive) and returns a signed RTT row.
  Every edge is measured by both ends — take the worse report (inflating hurts only yourself,
  deflating is caught by the counterparty). k≤16 ⇒ ≤240 pings, seconds.
- **Formation**: demand-first — the client (or a node it hires) is the FORMER; supply-driven
  volunteer fallback with deterministic backoff (`delay = base·h(peerid‖epoch)`); collisions
  waste one proposal round, nothing else. The former runs `shard.plan` locally over the
  content-addressed pool snapshot; members verify-and-sign (§2). Snapshot-CID determinism is a
  CI-locked property (same snapshot ⇒ byte-identical plan on any box; mismatch ⇒ refuse loudly).
- **Coordinator**: charter names head = `plan.head` (RTT-central, perf-pinned) + an eligible list
  (AutoNAT-confirmed public reachability — a relayed coordinator is a perf death). The client
  *chooses* among eligible coordinators per job: don't fix a bad coordinator, route around it.
  What a malicious one can actually do: see prompts (accepted PoC gap), not serve (client walks),
  inflate token counts (closed by client acks, §4). Coordinator stake/bond = post-PoC.
- **Churn**: standbys pre-sign the charter at epoch 0 — failover is a lookup, not an election
  (the engine's hot-standby + coordinator-churn recovery already does the data plane). Coordinator
  gossips `CHARTER_AMEND {epoch+1}`; un-pre-authorized replacements need a majority of surviving
  stages to countersign (only to stop a coordinator stuffing the ring with sybils mid-job).
  `SWARM_HEALTH` gossip (~15s) is how joiners find gaps and clients find swarms; receipts bind to
  `(swarm, epoch)`.

## 4. Settlement without a central settler

Receipts already verify anywhere. Verification moves to the **payer**; the flow becomes chunked
tit-for-tat with bounded exposure — torrent-native, no escrow needed for the PoC:

1. Client sends the job + nonce + a signed rate commitment (`price × maxTokens`).
2. The swarm serves in chunks (~512 tokens). Per chunk the coordinator returns output + the
   per-stage receipt set.
3. Client runs `shard.verify` (pure crypto, no GPU), signs a **delivery ack**
   `{job, tokens, h(output)}`, pays the chunk per stage by the charter split (each stage
   recomputes its own share from public data; zero discretion).
   `tokens_paid = min(coordinator claim, client ack)` — **this closes the known token-count gap**:
   the payer attests what it received.
4. Stages see chunk N paid before serving chunk N+2 (one chunk of float). A stiffing client
   loses the swarm at one chunk's cost + a gossiped, signed non-payment strike. A cheating stage
   ⇒ verify fails ⇒ nobody paid for the chunk (unchanged rule) + spot-check/reputation.
5. Disputes = publish the bundle `{charter, receipts, acks, payment proofs}` — every element
   signed and machine-checkable by any third party. PoC disputes resolve to reputation.

The c0mpute rail becomes a dumb executor of client-signed pay instructions (custody still
central, now auditable); true on-chain escrow / payment channels (the `onchain-staking.ts` rails
and `GradedReputation.isStaked` seam are adjacent) is the post-PoC upgrade. **Do not build
pay-the-honest-prefix yet**: receipts attribute the faulty stage, but mis-attribution that pays a
cheater is worse than pay-nobody — that change needs its own adversarial round first.

## 5. Central residue (the honest minimum, each with an exit)

| Residue | Why it stays (PoC) | Path out |
|---|---|---|
| 2–3 bootstrap/relay sidecars | DHT entry + NAT relay | peer-exchange + published list (every DHT lives with this) |
| Manifest signing key | someone blesses "this CID is M2.5" | wrong weights still fail hash-verify; later an on-chain registry |
| Payment rail | real money moves | rail executes only client-signed instructions (§4), then channels/x402 |
| Reputation aggregate | needs history | evidence gossiped + signed; each payer aggregates locally (opinions local, evidence global) |
| We-run auditor boxes | zero supply tax spot-check | VRF-sampled staked auditors, post-PoC |

## 6. Migration stages (each shippable + locally testable; demos that LOOK decentralized)

1. **Asks + cheapest-adequate formation** (days). `NodeCapabilities.ask`, greedy price-ordered
   loop around unchanged `shard.plan`, charter freezes asks, price-weighted `splitTokens`.
   *Test/demo*: extended `swarm-loop-demo.ts` — cheapest adequate ring forms; an underpriced-slow
   node is excluded by the floor; price prints per charter.
2. **DHT announce + peer-measured RTT** (shares the sidecar DHT shipped for the weight-fetch).
   Signed announce records on gossipsub/DHT; RTT rows signed per prober, symmetry-checked;
   `planInputsHash` lands in every assignment. Orchestrator becomes *a* reader of the pool.
   *Demo*: two independent orchestrator processes assemble the identical pool + identical plan.
3. **Self-forming swarms.** Former-proposes / members verify-and-sign charters
   (`/shard/charter/1.0.0`); `markReady` moves to the coordinator.
   *Flagship demo*: 6 sim nodes + orchestrator; `kill -9` the orchestrator; **a swarm still forms
   and serves.** The tracker is a convenience, not a dependency.
4. **Public settlement + client acks + chunked pay.** Receipt sets published (content-addressed);
   any third-party watcher reaches the same PAID/REJECTED verdicts; client-signed delivery acks
   bound the token count; `settled` journal persisted (fixes the double-pay-on-restart bug).
   *Demo*: a credential-less skeptic audits every settlement live and flags the dishonest one.
5. **Price dynamics + multi-swarm routing.** Utilization controller, epoch re-quotes, ≥15%
   re-form rule, the price ticker; gateway quotes all live charters and routes cheapest-adequate.
   *Demo*: two swarms at different asks; traffic shifts to the cheap one; degrade it and the next
   request pays up. Supply/demand visibly clearing with no planner.
6. **Money hardening** (post-PoC): escrow/channels on-chain, coordinator bonds, staked auditors,
   per-stage fault attribution — each gated on its own adversarial review.

Stages 1–4 are the PoC market. The already-shipped P2P shard propagation is the same sidecar
machinery stage 2 needs, so 2 is cheaper than it reads.

## 7. Hard open problems (named, not hand-waved)

- **Wash-trading under token emissions** — the #1 economics risk. Client-paid jobs make
  self-dealing pointless, but the moment emissions subsidize supply, a sybil ring serving itself
  farms the subsidy with perfectly valid receipts. No receipt scheme detects
  economically-pointless-but-real work. Mitigations are economic (subsidize only spot-checked
  work, per-stake emission caps) and must be designed **before any emission schedule exists**.
- **Whole-ring collusion vs the client** (quality fraud: serving a smaller model with consistent
  receipts) — bounded only by the auditor sampling real traffic, which touches the privacy
  stance. Bounded, not closed.
- **Thin-market cartels**: five nodes in a region can hold asks high without a single message.
  Only telemetry-attracted entry fixes it; supply response time is unknown. Watch the ticker.
- **Eclipse at PoC scale**: at tens of nodes the DHT is thin and partitionable. Decentralization
  at this scale is *architectural*, not adversarially robust — say so publicly.
- **Adequacy floors need per-tier measurements** — the heterogeneous-device probes (4090 marlin
  numbers are in; Apple Silicon next) feed the honest floor constants.
- **Charter contention** under churn (two formers claiming one node) — one-slot lease +
  first-complete-charter-wins + timeouts; livelock is plausible and only testable under simulated
  churn.

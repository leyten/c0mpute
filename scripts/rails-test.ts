/**
 * Safety-rails unit tests — GradedReputation + SwarmManager's trust-pinned placement, spot-check
 * flow, and reputation feedback. Pure/headless: a fake seam records what it was asked and returns
 * scripted verdicts, so every rail is exercised with no GPUs and no python. Mirrors the project's
 * runnable-proof convention (scripts/swarm-loop-demo.ts) rather than a test framework.
 *
 * Run from the c0mpute repo root:  npx tsx scripts/rails-test.ts
 */
import assert from 'node:assert';
import {
  SwarmManager, DEFAULT_SWARM_CONFIG, type SwarmConfig, type SwarmDeps, type Seam, type ModelProfile,
} from '../lib/orchestrator/swarm';
import { GradedReputation, DEFAULT_REPUTATION_CONFIG } from '../lib/orchestrator/reputation';
import type { NodeCapabilities, RingPlan, SettleResult, BlockSketch } from '../lib/orchestrator/swarm-types';

let passed = 0;
function ok(name: string) { console.log(`  ok  ${name}`); passed += 1; }
function section(t: string) { console.log(`\n${t}`); }

const M25: ModelProfile = { layerCount: 62 };
// the OPT-IN private tier: pinning explicitly ON (the PoC default is now open — privacy: null).
const PINNED: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, privacy: { boundaryIn: 8, boundaryOut: 8 } };

async function main() {

/** A fake seam: `plan` runs a trivial trusted-aware planner over the request so we can assert the
 *  boundary invariant on real StageAssignments; `verify` + `challenge` return scripted verdicts. */
function fakeSeam(over: Partial<Seam> = {}): Seam & { lastPlanReq: any; lastChallenge: any } {
  const s: any = {
    lastPlanReq: null,
    lastChallenge: null,
    async plan(req: any): Promise<RingPlan | null> {
      s.lastPlanReq = req;
      const nodes: any[] = req.nodes;
      const nLayers: number = req.model.n_layers;
      const pin = req.privacy != null;
      // pick a head-first order: a trusted node first + last if pinning, then fill.
      const trusted = nodes.filter((n) => n.trusted);
      const rest = nodes.filter((n) => !n.trusted);
      let order: any[];
      if (pin) {
        if (trusted.length < 2) return null;
        order = [trusted[0], ...rest, ...trusted.slice(1)];
      } else {
        order = [...nodes];
      }
      const k = order.length;
      if (k < 1) return null;
      // tile layers: give the ends their boundary floors, spread the rest.
      const bIn = pin ? req.privacy.boundary_in : 0;
      const bOut = pin ? req.privacy.boundary_out : 0;
      const layers = new Array(k).fill(1);
      if (pin) { layers[0] = Math.max(layers[0], bIn); layers[k - 1] = Math.max(layers[k - 1], bOut); }
      let rem = nLayers - layers.reduce((a, b) => a + b, 0);
      // pile the remainder onto interior stages (keep the ends at their floor)
      for (let i = 1; i < k - 1 && rem > 0; i++) { layers[i] += rem; rem = 0; }
      if (rem > 0) { layers[Math.floor(k / 2)] += rem; }        // 2-stage fallback
      const stages: RingPlan['stages'] = [];
      let lo = 0;
      order.forEach((n, i) => {
        const hi = lo + layers[i];
        const boundary = pin && (i === 0 || i === k - 1 || lo < bIn || hi > nLayers - bOut);
        stages.push({ id: n.id, index: i, lo, hi, head: i === 0, tail: i === k - 1, layers: layers[i], boundary });
        lo = hi;
      });
      const plan: RingPlan = {
        order: order.map((n) => n.id), head: order[0].id, stages, dropped: [],
        step_ms: 100, tok_s_per_g: 10, k,
      };
      if (pin) {
        plan.privacy = { boundary_in: bIn, boundary_out: bOut,
          boundary_stages: stages.filter((st) => st.boundary).map((st) => st.id) };
      }
      return plan;
    },
    async verify(): Promise<SettleResult> { return { ok: true, stages: [] }; },
    async challenge(): Promise<any> { return { cosine: 1, rel_norm: 0, passed: true }; },
  };
  return Object.assign(s, over);
}

function harness(cfg: SwarmConfig, deps: Partial<SwarmDeps> = {}) {
  const emitted: { nodeId: string; event: string; data: any }[] = [];
  const ledger: any[] = [];
  const seam = deps.seam ?? fakeSeam();
  const mgr = new SwarmManager({
    seam,
    emit: (nodeId, event, data) => emitted.push({ nodeId, event, data }),
    recordStageEarning: (e) => ledger.push(e),
    log: () => {},
    newId: (p) => `${p}-${emitted.length}-${ledger.length}`,
    now: deps.now,
    trust: deps.trust,
    ...deps,
  }, cfg);
  return { mgr, emitted, ledger, seam: seam as any };
}

function cap(pubkey: string, over: Partial<NodeCapabilities> = {}): NodeCapabilities {
  return { pubkey, gpu: 'RTX 5090', freeVramMb: 30 * 1024, subnet: `${pubkey}.0.0/24`, ...over };
}

const flatRtt = (n: number) => Array.from({ length: n }, (_, i) =>
  Array.from({ length: n }, (_, j) => (i === j ? 0 : 20)));

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('1. GradedReputation — scoring, role gates, stake, consec-fail reject');

{
  const staked = new Set(['S1', 'S2']);
  const rep = new GradedReputation({ isStaked: (p) => staked.has(p) }, {});
  // a fresh stranger lands at 'middle' (open admission), never 'boundary'
  assert.equal(rep.roleFor('newbie'), 'middle');
  ok('fresh stranger -> middle (open admission), not boundary');

  // score alone never earns boundary — stake is required
  for (let i = 0; i < 20; i++) rep.record('rich-unstaked', 'spot_check_pass');
  assert.ok(rep.score('rich-unstaked') >= DEFAULT_REPUTATION_CONFIG.boundaryMin);
  assert.equal(rep.roleFor('rich-unstaked'), 'middle');
  ok('high score but unstaked -> still middle (stake-gated boundary)');

  // staked + high score -> boundary
  for (let i = 0; i < 20; i++) rep.record('S1', 'spot_check_pass');
  assert.equal(rep.roleFor('S1'), 'boundary');
  ok('staked + high score -> boundary');

  // staked but low score -> not boundary (stake is necessary, not sufficient)
  assert.equal(rep.roleFor('S2'), 'middle');   // S2 staked, default score 40 < boundaryMin 70
  ok('staked but mediocre score -> middle (stake necessary, not sufficient)');

  // two consecutive spot-check fails -> rejected outright, even from a high base
  rep.record('S1', 'spot_check_fail');
  assert.notEqual(rep.roleFor('S1'), 'rejected');   // one fail is not enough
  rep.record('S1', 'spot_check_fail');
  assert.equal(rep.roleFor('S1'), 'rejected');
  ok('two consecutive spot-check fails -> rejected (was boundary)');

  // a pass between two fails resets the consecutive-fail counter (isolate from the score floor by
  // starting high — two -35 fails from ~100 with a +4 pass between still clear rejectBelow)
  const rep2 = new GradedReputation({}, {});
  for (let i = 0; i < 20; i++) rep2.record('x', 'spot_check_pass');   // -> score 100
  rep2.record('x', 'spot_check_fail');
  rep2.record('x', 'spot_check_pass');
  rep2.record('x', 'spot_check_fail');
  assert.notEqual(rep2.roleFor('x'), 'rejected');   // fails not consecutive AND score still > floor
  ok('a pass between fails resets the consec-fail counter (score-floor isolated)');

  // an invalid receipt tanks the score toward relegation/rejection
  const rep3 = new GradedReputation({}, {});
  rep3.record('bad', 'receipt_invalid');
  assert.ok(['relegated', 'rejected'].includes(rep3.roleFor('bad')));
  ok('receipt_invalid drops a node off the stage pool');

  // snapshot/restore round-trips
  const snap = rep.snapshot();
  const rep4 = new GradedReputation({ isStaked: (p) => staked.has(p) }, {});
  rep4.restore(snap);
  assert.equal(rep4.score('S2'), rep.score('S2'));
  ok('snapshot/restore preserves scores + counters');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('2. Boundary pinning fails CLOSED without a trust oracle');

{
  const cfg = { ...PINNED };                 // private tier: pinning ON
  const { mgr } = harness(cfg);              // NO trust dep
  for (const p of ['A', 'B', 'C', 'D']) mgr.announce(`n-${p}`, cap(p), 'm', 'mf', `acct-${p}`);
  const swarm = await mgr.formSwarm('m', 'mf', M25, flatRtt(4));
  assert.equal(swarm, null);
  ok('privacy on + no oracle -> formSwarm returns null (no leaky ring)');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('3. Placement never puts an untrusted node on a boundary stage');

{
  const staked = new Set(['T1', 'T2']);
  const rep = new GradedReputation({ isStaked: (p) => staked.has(p) }, {});
  for (const p of ['T1', 'T2']) for (let i = 0; i < 20; i++) rep.record(p, 'spot_check_pass');
  const { mgr, emitted, seam } = harness({ ...PINNED }, { trust: rep });
  // 2 trusted (boundary-eligible) + 3 untrusted strangers
  const pubs = ['T1', 'T2', 'U1', 'U2', 'U3'];
  pubs.forEach((p, i) => mgr.announce(`n-${p}`, cap(p, { freeVramMb: 20 * 1024, subnet: `${i}.0.0/24` }), 'm', 'mf', `a-${p}`));
  const swarm = await mgr.formSwarm('m', 'mf', M25, flatRtt(5));
  assert.ok(swarm, 'should form with 2 trusted + 3 middle');
  // the plan request carried real trust flags (assigned, not self-reported)
  const trustedInReq = seam.lastPlanReq.nodes.filter((n: any) => n.trusted).map((n: any) => n.id);
  assert.deepEqual(trustedInReq.sort(), ['n-T1', 'n-T2']);
  ok('plan request marks exactly the staked+high-rep nodes trusted');
  // every boundary/head/tail assignment landed on a trusted node (emit target is the node id)
  const assigns = emitted.filter((e) => e.event === 'swarm:assign');
  for (const { nodeId, data: a } of assigns) {
    if (a.boundary || a.isHead || a.isTail) {
      assert.ok(staked.has(swarm!.stages.find((s) => s.nodeId === nodeId)!.pubkey),
        `untrusted node ${nodeId} got a boundary/end stage`);
    }
  }
  ok('every boundary + head + tail stage is a trusted node');
  // strangers only ever hold deep-middle
  for (const st of swarm!.stages) {
    if (!staked.has(st.pubkey)) {
      assert.ok(st.layerStart >= 8 && st.layerEnd <= 62 - 8 && !st.boundary,
        `stranger ${st.nodeId} holds [${st.layerStart},${st.layerEnd})`);
    }
  }
  ok('untrusted stages hold only deep-middle layers');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('4. relegated/rejected nodes are kept out of the stage pool');

{
  const staked = new Set(['T1', 'T2']);
  const rep = new GradedReputation({ isStaked: (p) => staked.has(p) }, {});
  for (const p of ['T1', 'T2']) for (let i = 0; i < 20; i++) rep.record(p, 'spot_check_pass');
  rep.record('FLAKY', 'flake'); rep.record('FLAKY', 'flake');   // 40->24: relegated (admitted, off-stage)
  assert.equal(rep.roleFor('FLAKY'), 'relegated');
  const { mgr, seam } = harness({ ...DEFAULT_SWARM_CONFIG }, { trust: rep });
  ['T1', 'T2', 'M1', 'FLAKY'].forEach((p, i) => {
    const v = mgr.announce(`n-${p}`, cap(p, { subnet: `${i}.9.0.0/24` }), 'm', 'mf', `a-${p}`);
    assert.ok(v.ok, `${p} should still be ADMITTED (relegation is off-stage, not a ban)`);
  });
  await mgr.formSwarm('m', 'mf', M25, flatRtt(4));
  const ids = seam.lastPlanReq.nodes.map((n: any) => n.id);
  assert.ok(!ids.includes('n-FLAKY'), 'relegated node leaked into the stage pool');
  ok('a relegated node is admitted but filtered out of the stage pool');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('5. Spot-check flow: pass accrues, fail strikes + degrades the swarm');

{
  const staked = new Set(['T1', 'T2']);
  const rep = new GradedReputation({ isStaked: (p) => staked.has(p) }, {});
  for (const p of ['T1', 'T2']) for (let i = 0; i < 20; i++) rep.record(p, 'spot_check_pass');
  let clock = 1000;
  // a challenge seam that fails the suspect
  const seam = fakeSeam({ async challenge() { return { cosine: 0.02, rel_norm: 0.9, passed: false }; } });
  const { mgr, emitted } = harness({ ...PINNED }, { trust: rep, seam, now: () => clock });
  ['T1', 'T2', 'U1', 'U2', 'U3'].forEach((p, i) =>
    mgr.announce(`n-${p}`, cap(p, { freeVramMb: 20 * 1024, subnet: `${i}.3.0.0/24` }), 'm', 'mf', `a-${p}`));
  const swarm = await mgr.formSwarm('m', 'mf', M25, flatRtt(5));
  for (const s of swarm!.stages) mgr.markReady(swarm!.id, s.nodeId);
  emitted.length = 0;
  const check = mgr.startSpotCheck(swarm!.id);
  assert.ok(check, 'a spot-check should launch against a stranger stage');
  assert.ok(!staked.has(check!.suspectPubkey), 'suspect must be a stranger (boundary nodes are trusted)');
  assert.ok(staked.has(check!.verifierPubkey), 'verifier must be trusted');
  const challengeEmits = emitted.filter((e) => e.event === 'swarm:challenge');
  assert.equal(challengeEmits.length, 2, 'both suspect and verifier get the challenge');
  ok('startSpotCheck picks a stranger suspect + trusted verifier, emits to both');
  const scoreBefore = rep.score(check!.suspectPubkey);
  const sk: BlockSketch = { n: 100, norm: 1, proj: [1, 2, 3] };
  assert.equal(await mgr.submitSketch(check!.checkId, check!.suspectNodeId, sk), null);   // waiting for verifier
  const verdict = await mgr.submitSketch(check!.checkId, check!.verifierNodeId, sk);
  assert.ok(verdict && verdict.passed === false);
  assert.ok(rep.score(check!.suspectPubkey) < scoreBefore, 'a failed spot-check must lower the score');
  assert.equal(mgr.getSwarm(swarm!.id)!.status, 'degraded', 'a failed spot-check degrades the swarm');
  ok('failed spot-check: suspect struck + swarm degraded');
}

{
  // expiry: a silent suspect is counted as a fail (refusal is not free)
  const staked = new Set(['T1', 'T2']);
  const rep = new GradedReputation({ isStaked: (p) => staked.has(p) }, {});
  for (const p of ['T1', 'T2']) for (let i = 0; i < 20; i++) rep.record(p, 'spot_check_pass');
  let clock = 1000;
  const { mgr } = harness({ ...PINNED }, { trust: rep, now: () => clock });
  ['T1', 'T2', 'U1', 'U2', 'U3'].forEach((p, i) =>
    mgr.announce(`n-${p}`, cap(p, { freeVramMb: 20 * 1024, subnet: `${i}.4.0.0/24` }), 'm', 'mf', `a-${p}`));
  const swarm = await mgr.formSwarm('m', 'mf', M25, flatRtt(5));
  for (const s of swarm!.stages) mgr.markReady(swarm!.id, s.nodeId);
  const check = mgr.startSpotCheck(swarm!.id)!;
  const before = rep.score(check.suspectPubkey);
  clock += DEFAULT_SWARM_CONFIG.spotCheckTimeoutMs + 1;
  const expired = mgr.sweepSpotChecks();
  assert.deepEqual(expired, [check.checkId]);
  assert.ok(rep.score(check.suspectPubkey) < before, 'a silent suspect must be struck on expiry');
  ok('overdue spot-check: silent suspect counted as a fail');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('6. A rejected node is refused at announce');

{
  const rep = new GradedReputation({}, {});
  rep.record('CHEAT', 'spot_check_fail');
  rep.record('CHEAT', 'spot_check_fail');            // -> rejected
  const { mgr } = harness({ ...DEFAULT_SWARM_CONFIG }, { trust: rep });
  const v = mgr.announce('n-CHEAT', cap('CHEAT'), 'm', 'mf', 'a-CHEAT');
  assert.equal(v.ok, false);
  ok('a node with a rejected reputation is refused at announce');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('7. privacy=null keeps the legacy (unpinned) path intact');

{
  const cfg: SwarmConfig = { ...DEFAULT_SWARM_CONFIG, privacy: null };
  const { mgr, emitted, seam } = harness(cfg);   // no trust oracle needed when privacy is off
  ['A', 'B', 'C', 'D'].forEach((p, i) =>
    mgr.announce(`n-${p}`, cap(p, { subnet: `${i}.7.0.0/24` }), 'm', 'mf', `a-${p}`));
  const swarm = await mgr.formSwarm('m', 'mf', M25, flatRtt(4));
  assert.ok(swarm, 'unpinned ring forms with no trust oracle');
  assert.ok(seam.lastPlanReq.privacy === undefined, 'no privacy block sent when pinning is off');
  assert.ok(seam.lastPlanReq.nodes.every((n: any) => n.trusted === false), 'trusted flags all false when off');
  const assigns = emitted.filter((e) => e.event === 'swarm:assign').map((e) => e.data);
  assert.ok(assigns.every((a) => a.boundary === false), 'no stage flagged boundary when pinning off');
  ok('privacy=null: forms unpinned, no privacy block, no boundary flags');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
section('8. Open PoC (leyten 2026-07-08): any machine any slice; receipts+reputation+spot-check on');

{
  // DEFAULT config now has privacy: null -> fully open placement, no trusted node needed in a ring.
  assert.equal(DEFAULT_SWARM_CONFIG.privacy, null, 'PoC default must be fully open (privacy null)');
  const rep = new GradedReputation({}, {});                 // reputation on; no staking needed (open)
  // a we-run auditor (kept out of swarms, used to verify) + 5 plain strangers
  const AUDITOR = { nodeId: 'auditor-1', pubkey: 'AUD' };
  const seam = fakeSeam({ async challenge() { return { cosine: 0.03, rel_norm: 0.9, passed: false }; } });
  const { mgr, emitted } = harness({ ...DEFAULT_SWARM_CONFIG }, {
    trust: rep, seam, auditors: () => [AUDITOR],
  });
  // strangers announce and are placed on ANY slice (no trust gating)
  ['U1', 'U2', 'U3', 'U4', 'U5'].forEach((p, i) =>
    mgr.announce(`n-${p}`, cap(p, { freeVramMb: 20 * 1024, subnet: `${i}.8.0.0/24` }), 'm', 'mf', `a-${p}`));
  mgr.announce(AUDITOR.nodeId, cap(AUDITOR.pubkey, { subnet: '9.9.0.0/24' }), 'm', 'mf', 'a-aud');
  const swarm = await mgr.formSwarm('m', 'mf', M25, flatRtt(6));
  assert.ok(swarm, 'open swarm should form from strangers alone');
  // the auditor is NOT placed as a serving stage (stays available to verify)
  assert.ok(!swarm!.stages.some((s) => s.nodeId === AUDITOR.nodeId), 'auditor must not be a serving stage');
  assert.ok(swarm!.stages.every((s) => !s.boundary), 'no stage is a boundary stage when privacy is off');
  ok('fully open: strangers fill every slice; the auditor is held out of placement');
  for (const s of swarm!.stages) mgr.markReady(swarm!.id, s.nodeId);
  // spot-check runs using the auditor as the trusted verifier (no in-ring trusted node needed)
  emitted.length = 0;
  const check = mgr.startSpotCheck(swarm!.id);
  assert.ok(check && check.verifierNodeId === AUDITOR.nodeId, 'spot-check must verify via the auditor');
  const sk: BlockSketch = { n: 100, norm: 1, proj: [1, 2, 3] };
  await mgr.submitSketch(check!.checkId, check!.suspectNodeId, sk);
  const verdict = await mgr.submitSketch(check!.checkId, check!.verifierNodeId, sk);
  assert.ok(verdict && !verdict.passed, 'a faked block still fails the spot-check in the open PoC');
  ok('spot-check catches a cheating stranger via the we-run auditor (no supply tax)');
  // and a repeat cheater is refused at re-admission (reputation kick)
  rep.record('U-cheat', 'spot_check_fail'); rep.record('U-cheat', 'spot_check_fail');
  const v = mgr.announce('n-cheat', cap('U-cheat'), 'm', 'mf', 'a-cheat');
  assert.equal(v.ok, false, 'a repeat cheater must be refused at admission');
  ok('reputation kicks a repeat cheater at admission (open supply, no trusted stage needed)');
}

console.log(`\nALL ${passed} rail assertions passed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

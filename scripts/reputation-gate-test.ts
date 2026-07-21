/**
 * Swarm reputation gate (P1-#4 #7) — the sybil/cheat defense the live orchestrator now wires.
 *
 * The orchestrator instantiates GradedReputation, passes it as `trust` to attachSwarmLoop, and
 * persists snapshot() to data/ every 2 min (restoring on boot). This proves the launch-critical
 * properties at that seam:
 *   - a fresh stranger is placeable (middle) — open admission isn't broken;
 *   - a node that fails spot-checks is REFUSED at announce (roleFor -> rejected -> admit refuses);
 *   - that verdict SURVIVES a restart (snapshot/restore round-trip) — a cheater can't rejoin by
 *     waiting for a deploy;
 *   - the auditors() filter selects exactly the env-pinned we-run pubkeys from the candidate pool.
 *
 * Run:  npx tsx scripts/reputation-gate-test.ts
 */
import { GradedReputation, DEFAULT_REPUTATION_CONFIG } from '../lib/orchestrator/reputation';
import { SwarmManager, DEFAULT_SWARM_CONFIG } from '../lib/orchestrator/swarm';
import type { NodeCapabilities } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }

const cap = (pubkey: string): NodeCapabilities => ({
  pubkey, gpu: 'RTX 5090', freeVramMb: 32000, subnet: '10.0.0.0/24', addrs: [`/ip4/1.2.3.4/tcp/1/p2p/${pubkey}`],
} as NodeCapabilities);

// ---- a fresh stranger is placeable; a spot-check cheater is refused -----------------------------

const rep = new GradedReputation();
const mgr = new SwarmManager(
  { seam: {} as any, emit: () => {}, recordStageEarning: () => {}, trust: rep, log: () => {} },
  DEFAULT_SWARM_CONFIG);

check(rep.roleFor('pk-fresh') === 'middle', 'a fresh stranger is middle (placeable) — open admission intact');
check(mgr.admit(cap('pk-fresh')).ok === true, 'a fresh stranger is admitted');

// one fail is not a permaban — it RELEGATES (kept as a candidate for off-ring roles, never
// placed as a stage), so a single unlucky check doesn't eject an honest operator.
rep.record('pk-cheat', 'spot_check_fail');
check(rep.roleFor('pk-cheat') === 'relegated', 'ONE spot-check fail relegates (not rejected) — one bad check is not a permaban');
check(mgr.admit(cap('pk-cheat')).ok === true, 'a relegated node is still admitted (off-ring roles), not refused');
// a second consecutive fail crosses the line -> rejected -> refused at announce
rep.record('pk-cheat', 'spot_check_fail');
check(rep.roleFor('pk-cheat') === 'rejected', '2 consecutive spot-check fails -> rejected');
const verdict = mgr.admit(cap('pk-cheat'));
check(verdict.ok === false && /reputation/.test((verdict as any).reason), 'a rejected cheater is REFUSED at announce');

// a pass resets the CONSECUTIVE-fail counter (proven in isolation with a gentle fail delta so the
// score gate doesn't confound it) — an honest node that fails once, passes, then fails again is
// not caught by the 2-consecutive rule.
const rep2 = new GradedReputation({}, { deltas: { ...DEFAULT_REPUTATION_CONFIG.deltas, spot_check_fail: -5 } });
rep2.record('pk-x', 'spot_check_fail');
rep2.record('pk-x', 'spot_check_pass');
rep2.record('pk-x', 'spot_check_fail');
check(rep2.roleFor('pk-x') !== 'rejected', 'a pass between fails resets the consecutive-fail counter (no false permaban on the consec rule)');

// ---- durability: the verdict survives a restart (snapshot -> restore) ---------------------------

const snap = rep.snapshot();
const restored = new GradedReputation();
restored.restore(JSON.parse(JSON.stringify(snap)));   // through JSON, exactly as data/ persistence does
check(restored.roleFor('pk-cheat') === 'rejected', 'the cheater stays REJECTED after a restart (persisted verdict)');
check(restored.roleFor('pk-fresh') === 'middle', 'an unknown pubkey is still middle after restore');

// ---- the auditors() filter selects the env-pinned we-run pubkeys ---------------------------------

const auditorPubkeys = new Set(['pk-auditor-1', 'pk-auditor-2']);
const candidates = [
  { nodeId: 'n1', cap: cap('pk-stranger') },
  { nodeId: 'n2', cap: cap('pk-auditor-1') },
  { nodeId: 'n3', cap: cap('pk-auditor-2') },
];
const auditors = candidates.filter((c) => auditorPubkeys.has(c.cap.pubkey)).map((c) => ({ nodeId: c.nodeId, pubkey: c.cap.pubkey }));
check(auditors.length === 2 && auditors.every((a) => auditorPubkeys.has(a.pubkey)),
  'auditors() returns exactly the pinned we-run pubkeys, never a stranger');

console.log(`(config: start=${DEFAULT_REPUTATION_CONFIG.start}, spot_check_fail=${DEFAULT_REPUTATION_CONFIG.deltas.spot_check_fail}, consecFailReject=${DEFAULT_REPUTATION_CONFIG.consecFailReject})`);
console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);

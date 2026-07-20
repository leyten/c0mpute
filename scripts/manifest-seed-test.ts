/**
 * Standby-seeder hand-out (P0-#1, the torrent path) — orchestrator side (no daemon, no GPU).
 *
 * Under test: formSwarm's `seeders` on every swarm:assign — the free-candidate pool IS the
 * standby seeder set (their sidecars seed whatever verified ranges their disks hold), and the
 * operator's cfg.seedAddrs (env SWARM_SEED_ADDRS) lead the list so joiner #1 pulls peers-first.
 * Asserts: (1) assigns carry seeders = [operator seeds..., free candidates' dialable addrs],
 * (2) placed ringmates never appear as seeders (they're already in `peers`), (3) the dialable
 * pick skips a loopback first-addr, (4) no free candidates + no seedAddrs → no seeders field.
 *
 * Run:  npx tsx scripts/manifest-seed-test.ts
 */
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { attachSwarmLoop } from '../lib/orchestrator/swarm-loop';
import type { Seam, SwarmConfig } from '../lib/orchestrator/swarm';
import type { RingPlan, SettleResult, BlockSketch, StageAssignment } from '../lib/orchestrator/swarm-types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }

/** Plans a 2-stage ring over the FIRST two nodes only — everyone else stays a free candidate
 *  (the standby set the seeder hand-out draws from). */
class TwoStageSeam implements Seam {
  async plan(req: unknown): Promise<RingPlan | null> {
    const r = req as { nodes: { id: string }[]; model: { n_layers: number } };
    if (r.nodes.length < 2) return null;
    const L = r.model.n_layers;
    const stages = r.nodes.slice(0, 2).map((nd, i) => ({
      id: nd.id, index: i, lo: i * (L / 2), hi: (i + 1) * (L / 2),
      head: i === 0, tail: i === 1, layers: L / 2,
    }));
    return { order: stages.map((s) => s.id), head: stages[0].id, stages, dropped: [], step_ms: 100, tok_s_per_g: 10, k: 2 };
  }
  async verify(_r: unknown): Promise<SettleResult> { return { ok: true, stages: [] } as unknown as SettleResult; }
  async challenge(_r: { a: BlockSketch; b: BlockSketch }) { return { cosine: 1, rel_norm: 0, passed: true }; }
}

const SPEC = { model: 'minimax-m2.5', manifestRef: 'mf1:m25-nvfp4-v1@bafkreitestfixture', minStages: 2,
  profile: { layerCount: 62, prefill_bytes: 1e8, decode_bytes: 1.6e4, decode_steps: 64 } };

const CFG_BASE: Omit<SwarmConfig, 'seedAddrs'> = {
  admission: { mode: 'open', minFreeVramMb: 0 }, paySplit: 'layers',
  minCandidates: 2, privacy: null, spotCheckTimeoutMs: 60_000,
};

interface NodeSpec { pk: string; addrs: string[] }

/** Boot a loop, announce `specs` in order, resolve with every assign observed once formed. */
async function formOnce(specs: NodeSpec[], cfg: SwarmConfig):
  Promise<{ assigns: StageAssignment[]; close: () => void }> {
  const http = createServer();
  const server = new Server(http, { transports: ['websocket'] });
  server.use((s, next) => { (s as unknown as { privyUserId: string }).privyUserId = 'test-acct'; next(); });
  attachSwarmLoop(server, {
    recordStageEarning: () => {},
    config: cfg,
    seam: new TwoStageSeam(),
    resolveModel: (m) => (m === 'minimax-m2.5' ? SPEC : undefined),
    autoFormDebounceMs: 300,
    log: () => {},
  });
  await new Promise<void>((res) => http.listen(0, res));
  const url = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
  const sockets: ClientSocket[] = [];
  const assigns: StageAssignment[] = [];
  await new Promise<void>((resolve) => {
    for (const spec of specs) {
      const c = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: 'cwt_test' } });
      sockets.push(c);
      c.on('connect', () => c.emit('node:announce', {
        cap: { pubkey: spec.pk, gpu: 'RTX 5090', freeVramMb: 32000, subnet: '10.0.0.0/24', addrs: spec.addrs },
        model: 'minimax-m2.5', manifestRef: SPEC.manifestRef,
      }));
      c.on('swarm:assign', (a: StageAssignment) => {
        assigns.push(a);
        if (assigns.length === 2) resolve();
      });
    }
    setTimeout(() => resolve(), 8000);                 // fail loud downstream instead of hanging
  });
  return { assigns, close: () => { sockets.forEach((s) => s.close()); server.close(); http.close(); } };
}

async function main() {
  // ── scenario 1: operator seeds + one free candidate (with a loopback first-addr) ──
  const s1 = await formOnce([
    { pk: 'pk-a', addrs: ['/ip4/1.1.1.1/tcp/29600/p2p/A'] },
    { pk: 'pk-b', addrs: ['/ip4/2.2.2.2/tcp/29600/p2p/B'] },
    { pk: 'pk-free', addrs: ['/ip4/127.0.0.1/tcp/29600/p2p/F', '/ip4/9.9.9.9/tcp/29600/p2p/F'] },
  ], { ...CFG_BASE, seedAddrs: ['/ip4/8.8.8.8/tcp/29600/p2p/OP'] });
  check(s1.assigns.length === 2, 'a 2-stage ring formed with a third candidate left free');
  const seeders = s1.assigns[0]?.seeders ?? [];
  check(seeders[0] === '/ip4/8.8.8.8/tcp/29600/p2p/OP', 'operator seedAddrs lead the seeder list');
  check(seeders.includes('/ip4/9.9.9.9/tcp/29600/p2p/F'), 'free candidate handed out via its non-loopback addr');
  check(!seeders.some((s) => s.includes('/p2p/A') || s.includes('/p2p/B')),
    'placed ringmates are not repeated as seeders');
  check(s1.assigns.every((a) => JSON.stringify(a.seeders) === JSON.stringify(seeders)),
    'every stage of the ring gets the same seeder list');
  check(s1.assigns.every((a) => a.manifestRef === SPEC.manifestRef),
    'assignments carry the spec mf1 ref (the CID the pull pins bytes against)');
  s1.close();

  // ── scenario 2: nothing to hand out → the field is absent, not [] ──
  const s2 = await formOnce([
    { pk: 'pk-c', addrs: ['/ip4/3.3.3.3/tcp/29600/p2p/C'] },
    { pk: 'pk-d', addrs: ['/ip4/4.4.4.4/tcp/29600/p2p/D'] },
  ], { ...CFG_BASE });
  check(s2.assigns.length === 2, 'a 2-stage ring formed with no spare supply');
  check(s2.assigns.every((a) => a.seeders === undefined), 'no free candidates + no seedAddrs → no seeders field');
  s2.close();

  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  setTimeout(() => process.exit(failed ? 1 : 0), 100);
}

main().catch((e) => { console.error(e); process.exit(1); });

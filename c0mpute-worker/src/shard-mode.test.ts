/**
 * Offline proof for shard-mode command builders — $0, no spawn, no binaries.
 *   npx tsx c0mpute-worker/src/shard-mode.test.ts
 *
 * Asserts the sidecar/specpipe/coordinator argv match phase0/launch_libp2p.py's proven
 * wiring for each ring position (head, middle, tail) — the exact invocations that ran a
 * full 120B ring with signed receipts over libp2p (FLEET_STATE Session 4).
 */
import {
  buildSidecarArgs, buildStageArgs, buildCoordinatorArgs, shardEngineEnv,
  SHARD_PORTS, type RingAssignment, type ShardPaths,
} from './shard-mode.js';

let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { console.error(`  FAIL ${name} ${detail}`); process.exit(1); }
  passed++;
  console.log(`  OK ${name}${detail ? ' ' + detail : ''}`);
}

const paths: ShardPaths = {
  sidecar: '/opt/shard/sidecar', specpipe: 'phase0/specpipe.py', python: 'python3',
  nodeKey: '/root/node.key', workdir: '/root',
};

function asn(over: Partial<RingAssignment>): RingAssignment {
  return {
    jobId: 'j1', model: 'GLM-5.2', stage: 0, nstages: 3, lo: 0, hi: 40,
    nextMultiaddr: '', nextPeerId: '', isCoordinator: false,
    tailMultiaddr: '', tailPeerId: '', ...over,
  };
}

const TAIL_MA = '/ip4/2.2.2.2/tcp/29600/p2p/PeerTail';
const NEXT_MA = '/ip4/1.1.1.1/tcp/29600/p2p/PeerNext';

// ── HEAD (coordinator) sidecar: forwards ring->next AND ret->tail, no inbound ──
{
  const a = asn({ stage: 0, isCoordinator: true, nextMultiaddr: NEXT_MA, tailMultiaddr: TAIL_MA });
  const s = buildSidecarArgs(a, paths, '/ip4/9.9.9.9/tcp/29600');
  check('head sidecar no inbound', !s.includes('-inbound'));
  check('head sidecar forwards ring->next', s.join(' ').includes(`127.0.0.1:${SHARD_PORTS.FWD_RING}=${NEXT_MA}`));
  check('head sidecar forwards ret->tail', s.join(' ').includes(`127.0.0.1:${SHARD_PORTS.FWD_RET}=${TAIL_MA}`));
  check('head sidecar announces', s.join(' ').includes('-announce /ip4/9.9.9.9/tcp/29600'));
}

// ── MIDDLE sidecar: inbound + forward ring->next, NO ret ──
{
  const a = asn({ stage: 1, isCoordinator: false, nextMultiaddr: NEXT_MA });
  const s = buildSidecarArgs(a, paths, '/ip4/9.9.9.9/tcp/29600');
  check('middle sidecar has inbound', s.join(' ').includes(`-inbound 127.0.0.1:${SHARD_PORTS.ENG_IN}`));
  check('middle sidecar forwards ring', s.join(' ').includes(`${SHARD_PORTS.FWD_RING}=${NEXT_MA}`));
  check('middle sidecar no ret forward', !s.join(' ').includes(`${SHARD_PORTS.FWD_RET}=`));
}

// ── TAIL sidecar: inbound only, no forwards ──
{
  const a = asn({ stage: 2, isCoordinator: false, nextMultiaddr: '' });
  const s = buildSidecarArgs(a, paths, '/ip4/9.9.9.9/tcp/29600');
  check('tail sidecar has inbound', s.join(' ').includes(`-inbound 127.0.0.1:${SHARD_PORTS.ENG_IN}`));
  check('tail sidecar no forwards', !s.includes('-forward'));
}

// ── HEAD stage engine: --served-head, --next to local sidecar forward, lo/hi ──
{
  const a = asn({ stage: 0, lo: 0, hi: 40, nextMultiaddr: NEXT_MA });
  const e = buildStageArgs(a, paths);
  const j = e.join(' ');
  check('head stage 0', j.includes('--stage 0 --nstages 3'));
  check('head stage served-head', e.includes('--served-head'));
  check('head stage next local fwd', j.includes(`--next 127.0.0.1:${SHARD_PORTS.FWD_RING}`));
  check('head stage layers 0:40', j.includes('--lo 0 --hi 40'));
  check('head stage fast direct', e.includes('--fast') && e.includes('--direct-return'));
}

// ── TAIL stage engine: no --next, no --served-head ──
{
  const a = asn({ stage: 2, lo: 59, hi: 78, nextMultiaddr: '' });
  const e = buildStageArgs(a, paths);
  check('tail stage no next', !e.includes('--next'));
  check('tail stage no served-head', !e.includes('--served-head'));
  check('tail stage layers 59:78', e.join(' ').includes('--lo 59 --hi 78'));
}

// ── COORDINATOR driver: --coordinator, --tail to local ret forward, gen params ──
{
  const a = asn({ stage: 0, isCoordinator: true, nstages: 3, maxNew: 64, K: 4, depth: 2 });
  const c = buildCoordinatorArgs(a, paths);
  const j = c.join(' ');
  check('coord --coordinator', c.includes('--coordinator'));
  check('coord drives ngram pipe', c.includes('--ngram-draft') && c.includes('--pipe'));
  check('coord tail local ret', j.includes(`--tail 127.0.0.1:${SHARD_PORTS.FWD_RET}`));
  check('coord K/depth/maxnew', j.includes('--K 4') && j.includes('--depth 2') && j.includes('--max-new 64'));
}

// ── single-stage ring: coordinator has no separate tail forward ──
{
  const a = asn({ stage: 0, isCoordinator: true, nstages: 1, nextMultiaddr: '', tailMultiaddr: '' });
  const c = buildCoordinatorArgs(a, paths);
  check('single-ring coord no --tail', !c.includes('--tail'));
  const s = buildSidecarArgs(a, paths, '/ip4/9.9.9.9/tcp/29600');
  check('single-ring sidecar no forwards', !s.includes('-forward'));
}

// ── env: libp2p transport + receipts on ──
{
  const env = shardEngineEnv({ PATH: '/usr/bin' } as unknown as NodeJS.ProcessEnv);
  check('env libp2p transport', env.SHARD_TRANSPORT === 'libp2p');
  check('env receipts on', env.SHARD_RECEIPTS === '1');
  check('env preserves base', env.PATH === '/usr/bin');
}

console.log(`\nALL ${passed} PASS`);

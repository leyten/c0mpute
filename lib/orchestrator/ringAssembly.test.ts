/**
 * Offline proof for buildRingAssignments — $0, no socket, no engine.
 *   npx tsx lib/orchestrator/ringAssembly.test.ts
 *
 * Asserts the ring wiring matches launch_libp2p.py: each stage dials its successor, the
 * tail has no next, the head is the coordinator and holds the tail's return address, and
 * a malformed ring (gap, missing identity, empty) is rejected before any stage launches.
 */
import { buildRingAssignments, type RingStageWorker } from './ringAssembly';

let passed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (!cond) { console.error(`  FAIL ${name} ${detail}`); process.exit(1); }
  passed++;
  console.log(`  OK ${name}${detail ? ' ' + detail : ''}`);
}

function w(i: number, lo: number, hi: number): RingStageWorker {
  return {
    socketId: `sock${i}`, workerId: `W${i}`, privyUserId: `user${i}`,
    peerId: `Peer${i}`, multiaddr: `/ip4/10.0.0.${i}/tcp/29600/p2p/Peer${i}`, lo, hi,
  };
}

const gen = { messages: [{ role: 'user' as const, content: 'hi' }], maxNew: 64, K: 4, depth: 2 };

// ── 3-stage ring: 78 layers as 40/19/19 ──
{
  const ring = [w(0, 0, 40), w(1, 40, 59), w(2, 59, 78)];
  const a = buildRingAssignments('job1', 'GLM-5.2', ring, gen, 78);
  check('three assignments', a.length === 3);
  // head is coordinator, carries gen params + tail return addr
  check('head is coordinator', a[0].isCoordinator && a[0].stage === 0);
  check('head carries messages', a[0].messages?.length === 1 && a[0].maxNew === 64);
  check('head holds tail return', a[0].tailMultiaddr === ring[2].multiaddr && a[0].tailPeerId === 'Peer2');
  // head dials stage 1
  check('head -> stage1', a[0].nextMultiaddr === ring[1].multiaddr && a[0].nextPeerId === 'Peer1');
  // middle dials tail
  check('stage1 -> tail', a[1].nextMultiaddr === ring[2].multiaddr && a[1].nextPeerId === 'Peer2');
  check('stage1 not coordinator', !a[1].isCoordinator && !a[1].messages);
  // tail has no successor and no return addr
  check('tail has no next', a[2].nextMultiaddr === '' && a[2].nextPeerId === '');
  check('tail not coordinator', !a[2].isCoordinator);
  // layer blocks preserved
  check('blocks intact', a[0].lo === 0 && a[0].hi === 40 && a[2].lo === 59 && a[2].hi === 78);
  console.log('    ring:', a.map(x => `s${x.stage}[${x.lo}:${x.hi}]->${x.nextPeerId || 'TAIL'}`).join('  '));
}

// ── degenerate 1-stage ring: head is also tail, no separate return hop ──
{
  const a = buildRingAssignments('job2', 'M', [w(0, 0, 62)], gen, 62);
  check('single stage', a.length === 1);
  check('single is coordinator', a[0].isCoordinator);
  check('single has no next', a[0].nextMultiaddr === '');
  check('single has no separate tail return', a[0].tailMultiaddr === '' && a[0].tailPeerId === '');
}

// ── reject: layer gap ──
{
  let threw = false;
  try { buildRingAssignments('j', 'M', [w(0, 0, 40), w(1, 41, 78)], gen, 78); } catch { threw = true; }
  check('layer gap rejected', threw);
}

// ── reject: coverage short of total ──
{
  let threw = false;
  try { buildRingAssignments('j', 'M', [w(0, 0, 40), w(1, 40, 70)], gen, 78); } catch { threw = true; }
  check('short coverage rejected', threw);
}

// ── reject: missing transport identity ──
{
  const bad = w(1, 40, 78); bad.peerId = '';
  let threw = false;
  try { buildRingAssignments('j', 'M', [w(0, 0, 40), bad], gen, 78); } catch { threw = true; }
  check('missing peerId rejected', threw);
}

// ── reject: empty ring ──
{
  let threw = false;
  try { buildRingAssignments('j', 'M', [], gen, 78); } catch { threw = true; }
  check('empty ring rejected', threw);
}

console.log(`\nALL ${passed} PASS`);

// S3 ADMISSION PROOF (no GPU, no spend): the announced capability must produce a PLACEABLE role.
//
// probeMeasure() used to run `shard.probe --measure` only — the GPU half. The announced vector
// therefore had no uplink_mbps, no rtt_to_pool_ms and no nat_dialable, and shard's derive_role
// fails THREE gates without them: `uplink` (0 < 200), `nat_dialable` (absent is not true) and
// `hops_vs_rtt` (an absent pool RTT defaults to 9000 ms). Every healthy RTX 5090 on the 2026-07-28
// stranger ring was admitted as `verifier`, and a pool of verifiers forms no ring at all
// (docs/receipts/stranger-serve-20260728.json, bug S3).
//
// This drives the REAL probe against a REAL `shard.probe --serve` receiver on loopback, and the
// REAL role decision (`decideRole` -> `python -m shard.probe`). The GPU half is a fixture (this box
// has no CUDA); the NETWORK half — the part the fix adds — is genuinely measured.
//
//   From the repo root:   npx tsx scripts/probe-uplink-test.ts
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';

const SHARD_REPO = process.env.SHARD_REPO_PATH || process.env.C0MPUTE_SHARD_REPO
  || '/root/.openclaw/workspace/shard';
const PY = process.env.SHARD_PYTHON || 'python3';

/** A healthy 32 GB Blackwell running the cutlass kernel — the GPU half of a real 5090's vector
 *  (tests/test_probe.py's own fixture). Everything the fix is about is the NETWORK half. */
const GPU_5090 = {
  total_vram_mb: 32768.0,
  footprint_mb_per_layer: 1700.0,
  load_peak_extra_mb: 4300.0,
  has_fast_kernel: true,
  layer_ms: 0.75,
  can_recompute_block: true,
  disk_free_gb: 200.0,
};

const PLACEABLE = new Set(['interactive-anchor', 'batched-filler']);

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}

function wait(ms: number): Promise<void> { return new Promise((r) => { setTimeout(r, ms); }); }

async function main(): Promise<void> {
  if (!existsSync(`${SHARD_REPO}/shard/probe.py`)) {
    console.error(`no shard checkout at ${SHARD_REPO} — set SHARD_REPO_PATH`);
    process.exit(1);
  }
  process.env.SHARD_REPO_PATH = SHARD_REPO;
  process.env.C0MPUTE_SHARD_REPO = SHARD_REPO;
  process.env.C0MPUTE_SHARD_PYTHON = PY;
  process.env.C0MPUTE_SHARD_MODEL_DIR = '/nonexistent-model-dir';   // no CUDA here: measure_gpu
                                                                    // returns before touching it
  const netPort = await freePort();
  process.env.C0MPUTE_SHARD_NETPROBE_PORT = String(netPort);
  const servePort = await freePort();

  // imported AFTER the env is set — the module reads it at load
  const { probeMeasure, probePeers } = await import('../c0mpute-worker/src/shard-runner');
  const { decideRole } = await import('../lib/shard-admission');

  console.log(`== receiver: ${PY} -m shard.probe --serve --port ${servePort}`);
  const receiver = spawn(PY, ['-m', 'shard.probe', '--serve', '--port', String(servePort)],
    { cwd: SHARD_REPO, stdio: ['ignore', 'inherit', 'inherit'] });
  let failures = 0;
  try {
    await wait(2000);

    // ── RED: the vector as the daemon used to announce it (GPU half only) ──
    const gpuOnly = probeMeasure([]) ?? {};
    const redCap = { ...gpuOnly, ...GPU_5090 };
    const red = await decideRole(redCap);
    const redFailed = red.binding.find((b) => b.role === 'interactive-anchor')?.failed ?? [];
    console.log(`== without a network vector: role=${red.role} `
      + `(interactive-anchor failed: ${redFailed.join(',') || 'none'})`);
    if (red.role !== 'verifier') {
      console.error(`FAIL: expected the old shape to be admitted as verifier, got ${red.role}`);
      failures += 1;
    }
    for (const gate of ['uplink', 'nat_dialable', 'hops_vs_rtt']) {
      if (!redFailed.includes(gate)) {
        console.error(`FAIL: expected the old shape to fail the ${gate} gate`);
        failures += 1;
      }
    }

    // ── GREEN: probeMeasure with the assigned receiver measures the network vector too ──
    const measured = probeMeasure([`127.0.0.1:${servePort}`]) ?? {};
    console.log(`== measured network vector: uplink_mbps=${measured.uplink_mbps} `
      + `rtt_to_pool_ms=${measured.rtt_to_pool_ms} nat_dialable=${measured.nat_dialable}`);
    for (const key of ['uplink_mbps', 'rtt_to_pool_ms', 'nat_dialable']) {
      if (measured[key] === undefined) {
        console.error(`FAIL: probeMeasure did not produce ${key}`);
        failures += 1;
      }
    }
    if (typeof measured.uplink_mbps !== 'number' || measured.uplink_mbps <= 0) {
      console.error(`FAIL: uplink_mbps must be a positive measurement, got ${measured.uplink_mbps}`);
      failures += 1;
    }
    const greenCap = { ...measured, ...GPU_5090 };
    const green = await decideRole(greenCap);
    console.log(`== with a network vector: role=${green.role} `
      + `(layers=${green.layers}, predicted ${green.predicted_tok_s} tok/s)`);
    if (!PLACEABLE.has(green.role)) {
      console.error(`FAIL: a healthy 5090 must get a PLACEABLE role, got ${green.role} `
        + `(${JSON.stringify(green.binding)})`);
      failures += 1;
    }

    // A FAILED measurement is uplink_mbps: 0.0, not a missing key. Announcing that would flip
    // swarm.ts's all-or-nothing `upAll` on for a pool of honest zeros and plan the ring off
    // topology.py's 0.5 Mbps floor — worse than staying upload-blind.
    const deadPort = await freePort();               // nothing listening: every connect refused
    const dead = probeMeasure([`127.0.0.1:${deadPort}`]) ?? {};
    console.log(`== against a dead receiver: uplink_mbps=${dead.uplink_mbps} `
      + `rtt_to_pool_ms=${dead.rtt_to_pool_ms} nat_dialable=${dead.nat_dialable}`);
    if (dead.uplink_mbps !== 0) {
      console.error(`FAIL: a dead receiver must report uplink_mbps 0, got ${dead.uplink_mbps}`);
      failures += 1;
    }
    if (dead.rtt_to_pool_ms !== null) {
      console.error(`FAIL: a dead receiver must report rtt_to_pool_ms null, got ${dead.rtt_to_pool_ms}`);
      failures += 1;
    }
    const deadRole = await decideRole({ ...dead, ...GPU_5090 });
    if (deadRole.role !== 'verifier') {
      console.error(`FAIL: an unmeasurable node must not be placed, got ${deadRole.role}`);
      failures += 1;
    }

    if (probePeers('http://orchestrator.example:3000').length !== 1) {
      console.error('FAIL: probePeers must default to the orchestrator origin');
      failures += 1;
    }
    process.env.C0MPUTE_SHARD_PROBE_PEERS = '';
    if (probePeers('http://orchestrator.example:3000').length !== 0) {
      console.error('FAIL: an empty C0MPUTE_SHARD_PROBE_PEERS must opt out');
      failures += 1;
    }
  } finally {
    receiver.kill('SIGKILL');
  }
  console.log(failures ? `PROBE-UPLINK RESULT: FAIL (${failures})` : 'PROBE-UPLINK RESULT: PASS');
  process.exit(failures ? 1 : 0);
}

void main();

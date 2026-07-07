/**
 * SubprocessSeam — the runtime that reaches shard's planner + settlement over stdio.
 *
 * `python3 -m shard.plan` (place a ring) and `python3 -m shard.verify` (verify the receipt set) are
 * JSON-in / JSON-out. This spawns them so the orchestrator drives the ONE adversarially-tested
 * planner + the ONE receipt-crypto implementation, instead of re-porting either into TypeScript.
 * Deps point one way (c0mpute → shard); the boundary is a process, not a shared library.
 *
 * SHARD_REPO (env) locates the shard checkout; defaults to ../shard next to the c0mpute repo.
 */
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import type { RingPlan, SettleResult } from './swarm-types';
import type { Seam } from './swarm';

const DEFAULT_SHARD_REPO = process.env.SHARD_REPO ?? path.resolve(process.cwd(), '..', 'shard');
const DEFAULT_PYTHON = process.env.SHARD_PYTHON ?? 'python3';

interface RunOpts { shardRepo: string; python: string; timeoutMs: number }

function runModule<T>(mod: string, req: unknown, o: RunOpts): Promise<T> {
  return new Promise((resolve, reject) => {
    const proc = spawn(o.python, ['-m', mod], { cwd: o.shardRepo });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`${mod} timed out`)); }, o.timeoutMs);
    proc.stdout.on('data', (d) => (out += d));
    proc.stderr.on('data', (d) => (err += d));
    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      // both seams print JSON on stdout for every non-crash outcome (including a rejected verdict);
      // a non-zero exit with parseable JSON is a caller-error report, surfaced as the value.
      let parsed: unknown;
      try { parsed = JSON.parse(out); } catch {
        return reject(new Error(`${mod} exit ${code}: ${(err || out).slice(0, 300)}`));
      }
      resolve(parsed as T);
    });
    proc.stdin.write(JSON.stringify(req));
    proc.stdin.end();
  });
}

export class SubprocessSeam implements Seam {
  private readonly o: RunOpts;

  constructor(opts: { shardRepo?: string; python?: string; timeoutMs?: number } = {}) {
    this.o = {
      shardRepo: opts.shardRepo ?? DEFAULT_SHARD_REPO,
      python: opts.python ?? DEFAULT_PYTHON,
      timeoutMs: opts.timeoutMs ?? 30_000,
    };
  }

  async plan(req: unknown): Promise<RingPlan | null> {
    const r = await runModule<RingPlan | null | { error: string }>('shard.plan', req, this.o);
    if (r && typeof r === 'object' && 'error' in r) throw new Error(`shard.plan: ${(r as { error: string }).error}`);
    return r as RingPlan | null;
  }

  async verify(req: unknown): Promise<SettleResult> {
    return runModule<SettleResult>('shard.verify', req, this.o);
  }
}

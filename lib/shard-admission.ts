import { spawn } from 'node:child_process';
import path from 'node:path';

// Capability admission (shard ADMISSION_SPEC.md): the ONE seam where Compute Network calls the
// shard engine. The node runs shard's probe locally and submits its MEASURED cap vector;
// Compute Network — not the node — turns it into a role by driving `python3 -m shard.probe`
// (stdin {cap, model?, spec?} -> stdout verdict). shard owns the probe + physics; we own
// what to do with the role (store, place, price) — the boundary law, deps one way.
//
// Env: SHARD_REPO_PATH (checkout containing shard/, default ../shard), SHARD_PYTHON.

export interface RoleVerdict {
  role: 'interactive-anchor' | 'batched-filler' | 'verifier' | 'seeder' | 'reject';
  layers: number;
  n_single: number | null;
  n_max_interactive: number;
  n_max_batched: number;
  predicted_tok_s: number | null;
  predicted_agg_tok_s: number | null;
  c_ms: number;
  binding: { role: string; failed: string[] }[];
  spec: string;
}

const PROBE_TIMEOUT_MS = 15_000;

export function decideRole(
  cap: Record<string, unknown>,
  opts?: { model?: Record<string, unknown>; spec?: Record<string, unknown> }
): Promise<RoleVerdict> {
  const repo = process.env.SHARD_REPO_PATH || path.resolve(process.cwd(), '../shard');
  const py = process.env.SHARD_PYTHON || 'python3';
  return new Promise((resolve, reject) => {
    const child = spawn(py, ['-m', 'shard.probe'], { cwd: repo, timeout: PROBE_TIMEOUT_MS });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new Error(`shard.probe spawn failed: ${e.message}`)));
    child.on('close', (code) => {
      let verdict: RoleVerdict & { error?: string };
      try { verdict = JSON.parse(out); } catch {
        return reject(new Error(`shard.probe bad output (exit ${code}): ${(err || out).slice(0, 300)}`));
      }
      // the probe reports caller errors as JSON with a nonzero exit — surface, don't guess a role
      if (verdict.error || code !== 0) return reject(new Error(`shard.probe: ${verdict.error || `exit ${code}`}`));
      resolve(verdict);
    });
    child.stdin.end(JSON.stringify({ cap, model: opts?.model, spec: opts?.spec }));
  });
}

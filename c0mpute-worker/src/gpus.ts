// GPU discovery, shared by the CLI (how many cards to fan out over) and setup
// (how much VRAM the card we're pinned to has). Side-effect free, so the CLI can
// import it without pulling in the env-derived config constants — same reason
// models.ts is standalone.
import { spawnSync } from 'child_process';

/** Total VRAM (MB) of each GPU nvidia-smi reports, one entry per GPU. `pin` is
 *  passed straight to `-i`; empty queries the whole box. Empty result if
 *  undetectable (Apple Silicon / no nvidia-smi) or if the pin is rejected. */
export function queryVramMB(pin: string): number[] {
  const args = ['--query-gpu=memory.total', '--format=csv,noheader,nounits'];
  const r = spawnSync('nvidia-smi', pin ? ['-i', pin, ...args] : args, {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout
    .trim()
    .split('\n')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/** NVML indexes of every GPU in the box, as nvidia-smi numbers them (`-i` takes
 *  these). Normally 0..N-1, but read rather than assumed so a card that fails to
 *  report doesn't silently shift the numbering of the others. Empty on a box
 *  with no nvidia-smi. */
export function listGpuIndexes(): number[] {
  const r = spawnSync('nvidia-smi', ['--query-gpu=index', '--format=csv,noheader,nounits'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (r.status !== 0 || !r.stdout) return [];
  return r.stdout
    .trim()
    .split('\n')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}

/**
 * VRAM of the GPUs this process may actually use. nvidia-smi is an NVML tool and
 * does NOT honour CUDA_VISIBLE_DEVICES (that's a CUDA-runtime variable), so a
 * pinned worker would otherwise size itself against the BIGGEST card in the rig
 * instead of the one it runs on; we pass the pin through with -i, which takes
 * plain indices and full UUIDs. CUDA_VISIBLE_DEVICES can also hold forms
 * nvidia-smi rejects (abbreviated UUIDs, MIG ids, "-1") — those fail the query
 * and fall back to the whole box, so detection degrades to the unpinned
 * behaviour, never to 0.
 */
export function detectGpuVramMB(pin: string): number[] {
  // Never forward a flag-shaped value ("-1" = ollama's "no GPU" idiom) into the
  // argument list.
  if (pin && !pin.startsWith('-')) {
    const pinned = queryVramMB(pin);
    if (pinned.length) return pinned;
  }
  return queryVramMB('');
}

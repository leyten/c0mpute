// Loads .env.local into process.env. MUST be imported FIRST in the server
// entrypoint — before any module that reads env into a top-level `const`.
// ES imports are hoisted and evaluate in order, so if the orchestrator (and its
// transitive `tokenomics.ts` config consts) were imported before this ran, those
// consts would read env that isn't set yet (the bug that left STAKER_ALLOWANCE_*
// reading their defaults). tsx does not auto-load .env.local.
import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (key && !process.env[key]) process.env[key] = value;
  }
} catch {
  console.warn('[Server] Could not load .env.local — relying on environment variables');
}

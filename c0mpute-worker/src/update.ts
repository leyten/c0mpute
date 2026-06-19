import { execSync, spawnSync } from 'child_process';
import { join } from 'path';

const PKG = '@c0mpute/worker';

/** True if `latest` is a higher semver than `current` (x.y.z, prerelease ignored). */
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) > (b[i] ?? 0)) return true;
    if ((a[i] ?? 0) < (b[i] ?? 0)) return false;
  }
  return false;
}

/** Fetch the latest published version from the npm registry (null on any failure). */
async function fetchLatestVersion(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`https://registry.npmjs.org/${PKG}/latest`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version || null;
  } catch {
    return null;
  }
}

/**
 * On startup, check npm for a newer worker version. If there is one, install it
 * globally and re-exec into it so the worker self-heals (e.g. a broken model
 * source pushed in a patch release). Best-effort: any failure logs a soft warning
 * and lets the current version run — an update check must never block the worker.
 *
 * Guards: skips if C0MPUTE_NO_UPDATE=1, and the re-exec sets C0MPUTE_UPDATED=1 so
 * the child never loops back into another update attempt.
 */
export async function maybeSelfUpdate(currentVersion: string): Promise<void> {
  if (process.env.C0MPUTE_NO_UPDATE === '1' || process.env.C0MPUTE_UPDATED === '1') return;

  const latest = await fetchLatestVersion();
  if (!latest || !isNewer(latest, currentVersion)) return;

  console.log(`Update available: v${currentVersion} -> v${latest}. Updating...`);
  try {
    execSync(`npm install -g ${PKG}@latest`, { stdio: 'inherit' });
  } catch {
    console.log('Auto-update failed (continuing on current version). Update manually with:');
    console.log(`  npm install -g ${PKG}@latest`);
    return;
  }

  // Re-exec the freshly installed version. Call node directly on the global entry
  // file (avoids PATH / .cmd shim differences across OSes), passing the original
  // CLI args through. C0MPUTE_UPDATED=1 stops the child from re-checking.
  try {
    const root = execSync('npm root -g').toString().trim();
    const entry = join(root, '@c0mpute', 'worker', 'dist', 'index.js');
    console.log(`Restarting on v${latest}...`);
    const r = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
      stdio: 'inherit',
      env: { ...process.env, C0MPUTE_UPDATED: '1' },
    });
    process.exit(r.status ?? 0);
  } catch {
    // Couldn't re-exec — tell the operator to restart so the new version takes hold.
    console.log(`Updated to v${latest}. Restart the worker to run the new version.`);
    process.exit(0);
  }
}

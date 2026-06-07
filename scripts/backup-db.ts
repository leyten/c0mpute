// Off-site backup of c0mpute.db to Supabase Storage.
//
// Dormant until the Supabase env vars are set (same pattern as the keeper), so
// it's safe to install now and activates the moment you drop creds into
// .env.local. Run by deploy/c0mpute-backup.timer (daily) or `tsx scripts/backup-db.ts`.
//
// Required env:
//   SUPABASE_URL            e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_KEY    service_role key (NOT the anon key — server-side only)
//   SUPABASE_BACKUP_BUCKET  a PRIVATE storage bucket name, e.g. "c0mpute-backups"
// Optional:
//   BACKUP_ENCRYPTION_KEY   passphrase; if set, the blob is AES-256-GCM encrypted
//                           before upload (recommended). Store this key OUTSIDE
//                           the VPS — you need it + .env.local to restore.
//   BACKUP_RETENTION        how many recent backups to keep (default 14)
//
// IMPORTANT: this backs up the DB only. The DB stores wallet keys encrypted with
// DEPOSIT_WALLET_KEY, so a leaked backup alone exposes no private keys — but a
// restore is useless without .env.local (the master keys). Keep a copy of
// .env.local somewhere safe (password manager), NOT in this same bucket.

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { tmpdir } from 'os';
import { gzipSync } from 'zlib';
import { createHash, createCipheriv, randomBytes } from 'crypto';
import Database from 'better-sqlite3';

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of envFile.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i);
    if (k && !process.env[k]) process.env[k] = t.slice(i + 1);
  }
} catch {}

const DB_PATH = join(process.cwd(), 'data', 'c0mpute.db');

function encrypt(buf: Buffer, passphrase: string): Buffer {
  const key = createHash('sha256').update(passphrase).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: [12B iv][16B tag][ciphertext]
  return Buffer.concat([iv, tag, enc]);
}

async function main() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_BACKUP_BUCKET;
  if (!url || !key || !bucket) {
    console.log('[Backup] Supabase env not set — backup dormant (set SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_BACKUP_BUCKET)');
    return;
  }
  if (!existsSync(DB_PATH)) {
    console.error(`[Backup] DB not found at ${DB_PATH}`);
    process.exit(1);
  }

  // Consistent single-file snapshot (folds in the WAL) via VACUUM INTO.
  const snapPath = join(tmpdir(), `c0mpute-snap-${Date.now()}.db`);
  const db = new Database(DB_PATH, { readonly: true });
  db.exec(`VACUUM INTO '${snapPath}'`);
  db.close();

  let blob = gzipSync(readFileSync(snapPath));
  unlinkSync(snapPath);

  const passphrase = process.env.BACKUP_ENCRYPTION_KEY;
  let ext = 'db.gz';
  if (passphrase) {
    blob = encrypt(blob, passphrase);
    ext = 'db.gz.enc';
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const objectName = `c0mpute-${stamp}.${ext}`;

  const res = await fetch(`${url}/storage/v1/object/${bucket}/${objectName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: blob,
  });
  if (!res.ok) {
    console.error(`[Backup] Upload failed (${res.status}): ${await res.text()}`);
    process.exit(1);
  }
  console.log(`[Backup] Uploaded ${objectName} (${(blob.length / 1024).toFixed(0)} KB)${passphrase ? ' [encrypted]' : ''}`);

  // Retention: keep the newest N, delete older.
  const keep = Number(process.env.BACKUP_RETENTION || 14);
  const listRes = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'desc' } }),
  });
  if (listRes.ok) {
    const items = (await listRes.json()) as { name: string }[];
    const backups = items.filter((i) => i.name.startsWith('c0mpute-')).map((i) => i.name).sort().reverse();
    const stale = backups.slice(keep);
    if (stale.length > 0) {
      const del = await fetch(`${url}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: stale }),
      });
      if (del.ok) console.log(`[Backup] Pruned ${stale.length} old backup(s), kept ${keep}`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('[Backup]', e); process.exit(1); });

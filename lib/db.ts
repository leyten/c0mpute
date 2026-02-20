import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'c0mpute.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        privy_id TEXT UNIQUE NOT NULL,
        wallet_address TEXT,
        x_username TEXT,
        x_id TEXT,
        is_worker INTEGER DEFAULT 0,
        prompts_sent INTEGER DEFAULT 0,
        zero_balance TEXT DEFAULT '0',
        balance_updated_at TEXT,
        total_sol_earned TEXT DEFAULT '0',
        jobs_completed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
  return _db;
}

function rowToProfile(row: Record<string, unknown>) {
  if (!row) return null;
  return {
    ...row,
    is_worker: !!row.is_worker,
  };
}

export function getProfileByPrivyId(privyId: string) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM profiles WHERE privy_id = ?').get(privyId) as Record<string, unknown> | undefined;
  return row ? rowToProfile(row) : null;
}

export function updateProfile(privyId: string, updates: Record<string, unknown>) {
  const db = getDb();
  const setClauses: string[] = [];
  const values: unknown[] = [];
  
  for (const [key, value] of Object.entries(updates)) {
    setClauses.push(`${key} = ?`);
    values.push(key === 'is_worker' ? (value ? 1 : 0) : value);
  }
  
  setClauses.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(privyId);
  
  db.prepare(`UPDATE profiles SET ${setClauses.join(', ')} WHERE privy_id = ?`).run(...values);
  return getProfileByPrivyId(privyId);
}

export function upsertProfile(data: { privy_id: string; wallet_address?: string | null; x_username?: string | null; x_id?: string | null }) {
  const db = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  
  const existing = getProfileByPrivyId(data.privy_id);
  
  if (existing) {
    // Update only the provided fields
    const updates: Record<string, unknown> = {};
    if (data.wallet_address !== undefined) updates.wallet_address = data.wallet_address;
    if (data.x_username !== undefined) updates.x_username = data.x_username;
    if (data.x_id !== undefined) updates.x_id = data.x_id;
    
    if (Object.keys(updates).length > 0) {
      return updateProfile(data.privy_id, updates);
    }
    return existing;
  }
  
  db.prepare(`
    INSERT INTO profiles (id, privy_id, wallet_address, x_username, x_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.privy_id, data.wallet_address || null, data.x_username || null, data.x_id || null, now, now);
  
  return getProfileByPrivyId(data.privy_id);
}

export function deleteProfile(privyId: string) {
  const db = getDb();
  db.prepare('DELETE FROM profiles WHERE privy_id = ?').run(privyId);
}

export function updateBalance(privyId: string, balance: number | string) {
  return updateProfile(privyId, {
    zero_balance: balance,
    balance_updated_at: new Date().toISOString(),
  });
}

/**
 * Atomically increment prompts_sent counter. Uses SQL increment to avoid race conditions.
 */
export function incrementPromptsSent(privyId: string) {
  const db = getDb();
  db.prepare(
    'UPDATE profiles SET prompts_sent = prompts_sent + 1, updated_at = ? WHERE privy_id = ?'
  ).run(new Date().toISOString(), privyId);
}

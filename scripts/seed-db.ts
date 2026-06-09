import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'c0mpute.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
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

// Synthetic sample profiles for local development only. No real users.
const now = new Date().toISOString();
const profiles = [
  { id: '00000000-0000-4000-8000-000000000001', privy_id: 'did:privy:example0000000000000000001', wallet_address: '11111111111111111111111111111111', x_username: 'demo_user', x_id: '1000000000000000001', is_worker: false, prompts_sent: 3 },
  { id: '00000000-0000-4000-8000-000000000002', privy_id: 'did:privy:example0000000000000000002', wallet_address: '22222222222222222222222222222222', x_username: null, x_id: null, is_worker: true, prompts_sent: 0 },
  { id: '00000000-0000-4000-8000-000000000003', privy_id: 'did:privy:example0000000000000000003', wallet_address: null, x_username: 'demo_worker', x_id: '1000000000000000003', is_worker: true, prompts_sent: 0 },
  { id: '00000000-0000-4000-8000-000000000004', privy_id: 'did:privy:example0000000000000000004', wallet_address: '44444444444444444444444444444444', x_username: null, x_id: null, is_worker: false, prompts_sent: 12 },
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO profiles (id, privy_id, wallet_address, x_username, x_id, is_worker, prompts_sent, zero_balance, balance_updated_at, total_sol_earned, jobs_completed, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((rows: typeof profiles) => {
  for (const p of rows) {
    insert.run(p.id, p.privy_id, p.wallet_address, p.x_username, p.x_id, p.is_worker ? 1 : 0, p.prompts_sent, '0', null, '0', 0, now, now);
  }
});

insertMany(profiles);

const count = db.prepare('SELECT COUNT(*) as count FROM profiles').get() as { count: number };
console.log(`Seeded ${count.count} synthetic profiles into ${DB_PATH}`);
db.close();

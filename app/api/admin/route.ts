import { NextRequest, NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import path from 'path';

let _db: Database.Database | null = null;
function getDb(): Database.Database {
  if (!_db) _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
  return _db;
}

function isAdmin(req: NextRequest): boolean {
  const token = req.headers.get('x-admin-token');
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !token) return false;
  // Constant-time comparison
  if (token.length !== secret.length) return false;
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return result === 0;
}

// GET — fetch dashboard data
export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const action = req.nextUrl.searchParams.get('action') || 'overview';

  if (action === 'overview') {
    const totalUsers = (db.prepare('SELECT COUNT(*) as c FROM profiles').get() as any).c;
    const totalJobs = (db.prepare('SELECT COUNT(*) as c FROM completed_jobs').get() as any)?.c || 0;
    const totalTokensGenerated = (db.prepare('SELECT COALESCE(SUM(tokens_generated),0) as c FROM completed_jobs').get() as any)?.c || 0;
    const totalEarningsPaid = (db.prepare("SELECT COALESCE(SUM(amount_usd),0) as c FROM worker_payouts WHERE status IN ('pending_transfer','completed')").get() as any)?.c || 0;
    const totalCreditsDeposited = (db.prepare('SELECT COALESCE(SUM(total_deposited),0) as c FROM user_credits').get() as any)?.c || 0;
    const totalCreditsSpent = (db.prepare('SELECT COALESCE(SUM(total_spent),0) as c FROM user_credits').get() as any)?.c || 0;
    const activeWorkerTokens = (db.prepare('SELECT COUNT(*) as c FROM worker_tokens WHERE revoked = 0').get() as any)?.c || 0;
    const recentJobs = db.prepare('SELECT * FROM completed_jobs ORDER BY completed_at DESC LIMIT 20').all();
    const recentPayouts = db.prepare('SELECT * FROM worker_payouts ORDER BY created_at DESC LIMIT 10').all();

    return NextResponse.json({
      totalUsers, totalJobs, totalTokensGenerated, totalEarningsPaid,
      totalCreditsDeposited, totalCreditsSpent, activeWorkerTokens,
      recentJobs, recentPayouts,
    });
  }

  if (action === 'reputation') {
    db.exec(`
      CREATE TABLE IF NOT EXISTS worker_reputation (
        privy_id TEXT PRIMARY KEY,
        canary_passed INTEGER DEFAULT 0,
        canary_failed INTEGER DEFAULT 0,
        coherence_failed INTEGER DEFAULT 0,
        speed_strikes INTEGER DEFAULT 0,
        total_strikes INTEGER DEFAULT 0,
        banned INTEGER DEFAULT 0,
        ban_reason TEXT,
        banned_at TEXT,
        first_seen TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const reputation = db.prepare(`
      SELECT r.*, p.x_username
      FROM worker_reputation r
      LEFT JOIN profiles p ON p.privy_id = r.privy_id
      ORDER BY r.banned DESC, r.total_strikes DESC, r.updated_at DESC
    `).all();
    return NextResponse.json({ reputation });
  }

  if (action === 'users') {
    const users = db.prepare(`
      SELECT p.privy_id, p.x_username, p.wallet_address, p.created_at,
             COALESCE(uc.balance, 0) as credit_balance,
             COALESCE(uc.total_deposited, 0) as credits_deposited,
             COALESCE(uc.total_spent, 0) as credits_spent,
             COALESCE(ws.total_jobs, 0) as worker_jobs,
             COALESCE(ws.total_tokens, 0) as worker_tokens_generated,
             COALESCE(we_sum.total_earned, 0) as worker_earnings_usd
      FROM profiles p
      LEFT JOIN user_credits uc ON uc.privy_id = p.privy_id
      LEFT JOIN worker_stats ws ON ws.privy_id = p.privy_id
      LEFT JOIN (SELECT privy_id, COALESCE(SUM(earning_usd), 0) as total_earned FROM worker_earnings GROUP BY privy_id) we_sum ON we_sum.privy_id = p.privy_id
      ORDER BY p.created_at DESC
    `).all();
    return NextResponse.json({ users });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// POST — admin actions
export async function POST(req: NextRequest) {
  if (!isAdmin(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  const db = getDb();

  if (action === 'set_credits') {
    const { privyId, amount } = body;
    if (!privyId || typeof amount !== 'number') return NextResponse.json({ error: 'privyId and amount required' }, { status: 400 });
    const now = new Date().toISOString();
    
    // Get current balance
    const current = db.prepare('SELECT balance FROM user_credits WHERE privy_id = ?').get(privyId) as any;
    const currentBalance = current?.balance || 0;
    const diff = amount - currentBalance;
    
    db.prepare(`
      INSERT INTO user_credits (privy_id, balance, total_deposited, total_spent, updated_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(privy_id) DO UPDATE SET balance = ?, updated_at = ?
    `).run(privyId, amount, amount > 0 ? amount : 0, now, amount, now);

    // Log the admin action
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, privyId, 'admin', Math.abs(diff), `Admin set balance to ${amount} (was ${currentBalance})`, null, now);

    return NextResponse.json({ ok: true, previousBalance: currentBalance, newBalance: amount });
  }

  if (action === 'add_credits') {
    const { privyId, amount } = body;
    if (!privyId || typeof amount !== 'number' || amount <= 0) return NextResponse.json({ error: 'privyId and positive amount required' }, { status: 400 });
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO user_credits (privy_id, balance, total_deposited, total_spent, updated_at)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(privy_id) DO UPDATE SET balance = balance + ?, total_deposited = total_deposited + ?, updated_at = ?
    `).run(privyId, amount, amount, now, amount, amount, now);

    const id = crypto.randomUUID();
    db.prepare('INSERT INTO credit_transactions (id, privy_id, type, amount, description, tx_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, privyId, 'admin', amount, `Admin added ${amount} credits`, null, now);

    const newBalance = (db.prepare('SELECT balance FROM user_credits WHERE privy_id = ?').get(privyId) as any)?.balance || 0;
    return NextResponse.json({ ok: true, newBalance });
  }

  if (action === 'unban_worker') {
    const { privyId } = body;
    if (!privyId) return NextResponse.json({ error: 'privyId required' }, { status: 400 });
    const now = new Date().toISOString();
    // Lift the ban and reset strikes so a false-positive worker gets a clean slate.
    db.prepare('UPDATE worker_reputation SET banned = 0, ban_reason = NULL, banned_at = NULL, total_strikes = 0, updated_at = ? WHERE privy_id = ?').run(now, privyId);
    return NextResponse.json({ ok: true });
  }

  if (action === 'update_payout_status') {
    const { payoutId, status } = body;
    if (!payoutId || !status) return NextResponse.json({ error: 'payoutId and status required' }, { status: 400 });
    const validStatuses = ['pending_transfer', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: `Invalid status. Use: ${validStatuses.join(', ')}` }, { status: 400 });
    const now = new Date().toISOString();
    db.prepare('UPDATE worker_payouts SET status = ?, completed_at = ? WHERE id = ?').run(status, now, payoutId);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

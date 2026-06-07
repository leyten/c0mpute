import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import Database from 'better-sqlite3';
import path from 'path';

let _db: Database.Database | null = null;
function getDb() {
  if (!_db) _db = new Database(path.join(process.cwd(), 'data', 'c0mpute.db'));
  return _db;
}

async function getPrivyId(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  return verifyPrivyToken(auth.slice(7));
}

// GET — get current plan
export async function GET(req: NextRequest) {
  const privyId = await getPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const db = getDb();
  const row = db.prepare('SELECT selected_plan FROM profiles WHERE privy_id = ?').get(privyId) as any;
  const plan = row?.selected_plan && row.selected_plan !== 'free' ? row.selected_plan : 'pro';
  return NextResponse.json({ plan });
}

// POST — update plan
export async function POST(req: NextRequest) {
  const privyId = await getPrivyId(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { plan } = await req.json();
  if (!['pro', 'max'].includes(plan)) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 });
  }
  const db = getDb();
  db.prepare('UPDATE profiles SET selected_plan = ? WHERE privy_id = ?').run(plan, privyId);
  return NextResponse.json({ plan });
}

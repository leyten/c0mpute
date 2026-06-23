import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { verifyWorkerToken, bindPeerId } from '@/lib/db';
import { verifyBindingProof } from '@/lib/identity';

// Node identity binding (shard step 2.3): a swarm node binds its libp2p PeerId to its
// c0mpute account. Auth is the node's cwt_ worker token (-> account); the node proves it
// controls the PeerId by signing a server-issued nonce with its node key (sidecar -prove).
// shard signs, c0mpute verifies + records — the boundary law.

const NONCE_TTL_MS = 5 * 60 * 1000;
const SECRET = process.env.NODE_BIND_SECRET || 'shard-node-bind-dev-secret'; // set in prod

function account(req: NextRequest): string | null {
  const h = req.headers.get('authorization');
  if (!h?.startsWith('Bearer ')) return null;
  const tok = h.slice(7);
  return tok.startsWith('cwt_') ? verifyWorkerToken(tok) : null;
}

// Stateless, account-bound, time-limited challenge — no server-side nonce store needed.
function issueNonce(privyId: string): string {
  const body = `${privyId}:${Date.now() + NONCE_TTL_MS}`;
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('hex').slice(0, 32);
  return `${body}:${mac}`;
}
function checkNonce(nonce: string, privyId: string): boolean {
  const parts = nonce.split(':');
  if (parts.length !== 3) return false;
  const [pid, expStr, mac] = parts;
  if (pid !== privyId || Number(expStr) < Date.now()) return false;
  const want = crypto.createHmac('sha256', SECRET).update(`${pid}:${expStr}`).digest('hex').slice(0, 32);
  return mac.length === want.length && crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want));
}

// GET — issue a binding challenge for this account's node to sign.
export async function GET(req: NextRequest) {
  const privyId = account(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ nonce: issueNonce(privyId) });
}

// POST {peerId, nonce, sig} — verify the proof and record PeerId <-> account.
export async function POST(req: NextRequest) {
  const privyId = account(req);
  if (!privyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { peerId?: string; nonce?: string; sig?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { peerId, nonce, sig } = body;
  if (!peerId || !nonce || !sig) return NextResponse.json({ error: 'peerId, nonce, sig required' }, { status: 400 });
  if (!checkNonce(nonce, privyId)) return NextResponse.json({ error: 'bad or expired nonce' }, { status: 400 });
  if (!verifyBindingProof(peerId, nonce, sig)) return NextResponse.json({ error: 'invalid binding proof' }, { status: 400 });

  bindPeerId(peerId, privyId);
  return NextResponse.json({ bound: true, peerId, account: privyId });
}

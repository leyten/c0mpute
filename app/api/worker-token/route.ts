import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { createWorkerToken, getWorkerTokens, revokeWorkerToken } from '@/lib/db';

async function getPrivyUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyPrivyToken(authHeader.slice(7));
}

// POST — create a new worker token
export async function POST(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Limit to 5 active tokens per user
  const existing = getWorkerTokens(privyId);
  if (existing.length >= 5) {
    return NextResponse.json({ error: 'Maximum 5 active tokens. Revoke one first.' }, { status: 400 });
  }

  let name = 'default';
  try {
    const body = await req.json();
    if (body.name) name = String(body.name).slice(0, 50);
  } catch {}

  const token = createWorkerToken(privyId, name);
  return NextResponse.json({ token });
}

// GET — list active tokens (without the actual token, just metadata)
export async function GET(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokens = getWorkerTokens(privyId);
  return NextResponse.json({ tokens });
}

// DELETE — revoke a token
export async function DELETE(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { tokenId } = await req.json();
    if (!tokenId) {
      return NextResponse.json({ error: 'tokenId required' }, { status: 400 });
    }
    const revoked = revokeWorkerToken(tokenId, privyId);
    return NextResponse.json({ revoked });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

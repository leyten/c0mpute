import { NextRequest, NextResponse } from 'next/server';
import { verifyPrivyToken } from '@/lib/privy-server';
import { createApiKey, getApiKeys, revokeApiKey } from '@/lib/db';

async function getPrivyUserId(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return verifyPrivyToken(authHeader.slice(7));
}

// POST — create a new API key (returns the raw key once)
export async function POST(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Limit to 5 active keys per user
  const existing = getApiKeys(privyId);
  if (existing.length >= 5) {
    return NextResponse.json({ error: 'Maximum 5 active API keys. Revoke one first.' }, { status: 400 });
  }

  let name = 'default';
  try {
    const body = await req.json();
    if (body.name) name = String(body.name).slice(0, 50);
  } catch {}

  const key = createApiKey(privyId, name);
  return NextResponse.json({ key });
}

// GET — list active keys (metadata only, never the raw key)
export async function GET(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ keys: getApiKeys(privyId) });
}

// DELETE — revoke a key
export async function DELETE(req: NextRequest) {
  const privyId = await getPrivyUserId(req);
  if (!privyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { keyId } = await req.json();
    if (!keyId) {
      return NextResponse.json({ error: 'keyId required' }, { status: 400 });
    }
    const revoked = revokeApiKey(keyId, privyId);
    return NextResponse.json({ revoked });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

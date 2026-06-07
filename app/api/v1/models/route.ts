import { NextRequest, NextResponse } from 'next/server';
import { io } from 'socket.io-client';
import { resolveApiKey } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORCH_URL = process.env.INTERNAL_ORCHESTRATOR_URL || 'http://127.0.0.1:3004';

// Quick live worker counts from the orchestrator (stats:update fires on connect).
// Returns null if unavailable → callers should assume models are up.
async function getWorkerCounts(): Promise<{ native: number; browser: number } | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { native: number; browser: number } | null) => {
      if (done) return;
      done = true;
      try { socket.disconnect(); } catch {}
      resolve(v);
    };
    const socket = io(ORCH_URL, { auth: { token: secret }, transports: ['websocket'], reconnection: false, timeout: 5000 });
    const t = setTimeout(() => finish(null), 6000);
    socket.on('stats:update', (s: any) => { clearTimeout(t); finish({ native: s?.nativeWorkers ?? 0, browser: s?.browserWorkers ?? 0 }); });
    socket.on('connect_error', () => { clearTimeout(t); finish(null); });
  });
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ') || !resolveApiKey(auth.slice(7).trim())) {
    return NextResponse.json({ error: { message: 'Invalid API key.', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } }, { status: 401 });
  }

  const counts = await getWorkerCounts();
  const proUp = counts ? counts.browser > 0 || counts.native > 0 : true; // unknown → assume up
  const maxUp = counts ? counts.native > 0 : true;
  const created = 1748000000;
  const model = (id: string, available: boolean, description: string) => ({
    id, object: 'model', created, owned_by: 'c0mpute', available, description,
  });

  return NextResponse.json({
    object: 'list',
    data: [
      model('c0mpute-pro', proUp, 'Uncensored 8B, fast. Pro tier.'),
      model('c0mpute-max', maxUp, 'Uncensored 27B with tools + vision + large context. Max tier.'),
      model('c0mpute-max-think', maxUp, 'c0mpute-max with extended chain-of-thought reasoning.'),
    ],
  });
}

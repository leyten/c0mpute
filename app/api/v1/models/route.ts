import { NextRequest, NextResponse } from 'next/server';
import { io } from 'socket.io-client';
import { resolveApiKey } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ORCH_URL = process.env.INTERNAL_ORCHESTRATOR_URL || 'http://127.0.0.1:3004';

// Quick live worker counts from the orchestrator (stats:update fires on connect).
// Returns null if unavailable → callers should assume models are up.
async function getWorkerCounts(): Promise<{ native: number; browser: number; byModel: Record<string, number>; swarmModels: string[] } | null> {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: { native: number; browser: number; byModel: Record<string, number>; swarmModels: string[] } | null) => {
      if (done) return;
      done = true;
      try { socket.disconnect(); } catch {}
      resolve(v);
    };
    const socket = io(ORCH_URL, { auth: { token: secret }, transports: ['websocket'], reconnection: false, timeout: 5000 });
    const t = setTimeout(() => finish(null), 6000);
    socket.on('stats:update', (s: any) => { clearTimeout(t); finish({ native: s?.nativeWorkers ?? 0, browser: s?.browserWorkers ?? 0, byModel: s?.nativeByModel ?? {}, swarmModels: s?.swarmModels ?? [] }); });
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
  const qwenUp = counts ? (counts.byModel['qwen3.8-27b-uncensored'] ?? 0) > 0 : true;
  // the swarm model is up iff a READY ring is serving it (swarmModels, not nativeByModel — swarm
  // nodes aren't native workers); unknown counts → assume up (same convention as above)
  const swarmUp = counts ? counts.swarmModels.includes('minimax-m2.5') : true;
  const created = 1748000000;
  // Flat per-message pricing (credits; 1 credit = $0.01) — c0mpute bills per
  // request, not per token. Costs mirror the orchestrator's charge table.
  const model = (id: string, available: boolean, description: string, credits: number) => ({
    id, object: 'model', created, owned_by: 'c0mpute', available, description,
    pricing: { type: 'per_message', credits, usd: credits / 100 },
  });

  // Retired ids (c0mpute-max, supergemma4-26b, code, …) still answer in
  // /chat/completions via mapModel aliases during the migration window, but
  // are no longer listed: this is the catalog we want new integrations on.
  return NextResponse.json({
    object: 'list',
    data: [
      model('qwen3.8-27b-uncensored', qwenUp, 'Qwen3.8 27B Uncensored — the c0mpute model. Tools, vision, thinking, no refusals.', 15),
      model('qwen3.8-27b-uncensored-think', qwenUp, 'Qwen3.8 27B Uncensored with extended chain-of-thought reasoning.', 20),
      model('c0mpute-pro', proUp, 'Uncensored 8B, fast, browser-powered.', 10),
      model('c0mpute-swarm', swarmUp, 'MiniMax-M2.5 (229B) served by the decentralized GPU swarm — no single host holds the model.', 10),
    ],
  });
}

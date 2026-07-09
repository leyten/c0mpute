import { NextResponse } from 'next/server';
import { getStakerStats } from '@/lib/keeper/onchain-rewards';

export const dynamic = 'force-dynamic';

// GET /api/staking/stats — public staker counts for the staking page.
// Cached in-process for 60s; the counts move slowly and the page is public.
let cache: { at: number; data: { stakers: number; autocompound: number } } | null = null;

export async function GET() {
  if (!cache || Date.now() - cache.at > 60_000) {
    cache = { at: Date.now(), data: getStakerStats() };
  }
  return NextResponse.json(cache.data);
}

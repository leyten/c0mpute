import { NextRequest, NextResponse } from 'next/server';
import { issueAnonToken, hashIp, verifyAnonToken } from '@/lib/anon-auth';
import { getAnonRemaining, getTodayFreeSubsidyUsd } from '@/lib/db';
import { ANON_FREE_PROMPT_LIMIT, FREE_SUBSIDY_DAILY_CAP_USD } from '@/lib/tokenomics';

// Issues (or refreshes) a signed anonymous-visitor token so a brand-new user can
// run their free prompts without logging in. The token binds the caller's hashed
// IP; the orchestrator enforces the per-session and per-IP caps at job time.
function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '0.0.0.0';
}

export async function POST(req: NextRequest) {
  // Global circuit breaker: once today's free-prompt budget is spent, don't hand
  // out anonymous sessions — the homepage shows the soft sign-in prompt instead.
  if (getTodayFreeSubsidyUsd() >= FREE_SUBSIDY_DAILY_CAP_USD) {
    return NextResponse.json({ capReached: true });
  }

  const ipHash = hashIp(clientIp(req));
  const body = await req.json().catch(() => ({} as any));

  // Reuse an existing token if the visitor already has one bound to this IP, so
  // their remaining count is preserved across reloads.
  const existing = body?.token ? verifyAnonToken(body.token) : null;
  let token: string;
  let aid: string;
  if (existing && existing.iph === ipHash) {
    token = body.token;
    aid = existing.aid;
  } else {
    token = issueAnonToken(ipHash);
    aid = verifyAnonToken(token)!.aid;
  }

  return NextResponse.json({
    token,
    limit: ANON_FREE_PROMPT_LIMIT,
    remaining: getAnonRemaining(aid, ANON_FREE_PROMPT_LIMIT),
  });
}

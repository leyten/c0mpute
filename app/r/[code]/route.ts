import { NextRequest, NextResponse } from 'next/server';
import { REFERRAL_CODE_RE } from '@/lib/referrals';

// Referral landing: c0mpute.ai/r/<code> → homepage with ?ref=<code>.
// The homepage stores the code client-side (30 days) so attribution survives
// the anonymous try-first phase and binds at signup.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const clean = (code || '').toLowerCase().trim();
  // Behind nginx, request.url carries the internal origin (localhost:3003) —
  // build the redirect from the forwarded host or the Location header sends
  // visitors to localhost.
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'c0mpute.ai';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const url = new URL('/', `${proto}://${host}`);
  if (REFERRAL_CODE_RE.test(clean)) {
    url.searchParams.set('ref', clean);
  }
  return NextResponse.redirect(url);
}

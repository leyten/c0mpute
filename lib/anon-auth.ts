/**
 * Anonymous-visitor identity tokens.
 *
 * Lets a brand-new visitor run their free prompts WITHOUT logging in. The token
 * is a signed, IP-bound identifier — the server issues it (binding the caller's
 * hashed IP at issuance time), and the orchestrator verifies the signature and
 * trusts the embedded IP hash for the per-IP daily cap. An anonymous identity
 * can ONLY ever draw free prompts; it never touches credits, deposits, staking
 * or the treasury beyond the free-subsidy lane.
 *
 * Format: anon.<base64url(payload)>.<hmac-sha256-base64url>
 * Both the web service (issuance) and the orchestrator (verification) read the
 * same secret from the environment, so the HMAC matches across processes.
 */
import crypto from 'crypto';

// PRIVY_APP_SECRET is always present in both the web and orchestrator processes,
// so it's a safe fallback if a dedicated ANON_TOKEN_SECRET isn't set.
const SECRET = process.env.ANON_TOKEN_SECRET || process.env.PRIVY_APP_SECRET || '';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // tokens expire after 7 days

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

/** Hash an IP so we never store raw addresses. Keyed by the same secret. */
export function hashIp(ip: string): string {
  return crypto.createHmac('sha256', SECRET).update('ip:' + ip).digest('hex').slice(0, 32);
}

export function issueAnonToken(ipHash: string): string {
  const payload = { aid: crypto.randomUUID(), iph: ipHash, iat: Date.now() };
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `anon.${b64}.${sign(b64)}`;
}

/** Verify signature + age; returns the anon id and bound IP hash, or null. */
export function verifyAnonToken(token: string): { aid: string; iph: string } | null {
  if (!SECRET || !token || !token.startsWith('anon.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, b64, sig] = parts;
  const expected = sign(b64);
  // Constant-time compare; bail if lengths differ (timingSafeEqual throws otherwise).
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, 'base64url').toString());
    if (!payload.aid || !payload.iph || typeof payload.iat !== 'number') return null;
    if (Date.now() - payload.iat > MAX_AGE_MS) return null;
    return { aid: payload.aid, iph: payload.iph };
  } catch {
    return null;
  }
}

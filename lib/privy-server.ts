/**
 * Server-side Privy JWT verification.
 * Used by both the orchestrator (server/index.ts) and Next.js API routes.
 */
import { PrivyClient } from '@privy-io/server-auth';

let _client: PrivyClient | null = null;

function getClient(): PrivyClient {
  if (!_client) {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    if (!appId || !appSecret) {
      throw new Error('Missing NEXT_PUBLIC_PRIVY_APP_ID or PRIVY_APP_SECRET env vars');
    }
    _client = new PrivyClient(appId, appSecret);
  }
  return _client;
}

/**
 * Verify a Privy access token and return the user's Privy DID (e.g. "did:privy:xxx").
 * Returns null if the token is invalid or expired.
 */
export async function verifyPrivyToken(token: string): Promise<string | null> {
  try {
    const client = getClient();
    const verifiedClaims = await client.verifyAuthToken(token);
    return verifiedClaims.userId;
  } catch {
    return null;
  }
}

/**
 * Extract and verify the Privy token from a Next.js API request's Authorization header.
 * Expects: Authorization: Bearer <token>
 * Returns the Privy user ID (DID) or null.
 */
export async function getAuthUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  return verifyPrivyToken(token);
}

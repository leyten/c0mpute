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

/**
 * True only if `wallet` is a Solana wallet the user has actually LINKED in Privy.
 * Gate any profile wallet write on this — otherwise a caller could claim a wallet
 * (and its stake → worker boost + daily free-credit allowance) it doesn't control.
 */
export async function userOwnsSolanaWallet(privyId: string, wallet: string): Promise<boolean> {
  try {
    const u = await getClient().getUserById(privyId);
    return (u.linkedAccounts ?? []).some(
      (a) => (a as { type?: string; chainType?: string; address?: string }).type === 'wallet'
        && (a as { chainType?: string }).chainType === 'solana'
        && (a as { address?: string }).address === wallet
    );
  } catch {
    return false;
  }
}

/**
 * Delete a Privy user by DID. This removes the underlying Privy account and frees
 * any linked wallet, so the wallet can later be linked to a different login.
 * (Deleting only the app's profile row leaves the Privy user — and its wallet link — intact.)
 */
export async function deletePrivyUser(did: string): Promise<void> {
  const client = getClient();
  await client.deleteUser(did);
}

// Credit/deposit configuration. Deposits are USDC-only.

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CREDITS_PER_USD = 100; // 1 credit = $0.01

export type DepositTokenKind = 'USDC';

export interface DepositToken {
  mint: string;
  kind: DepositTokenKind;
}

// The set of tokens a user can deposit to buy credits.
export function getConfiguredDepositTokens(): DepositToken[] {
  return [{ mint: USDC_MINT, kind: 'USDC' }];
}

// USD price of one whole token. USDC is pegged at $1. Returns null for any
// other mint so the caller skips crediting.
export async function getTokenUsdPrice(mint: string): Promise<number | null> {
  return mint === USDC_MINT ? 1 : null;
}

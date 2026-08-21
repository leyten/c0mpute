// Credit/deposit configuration. Deposits are USDC-only.

export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ── The two credit rates ──
//
// VALUE rate: what a credit is WORTH when it is spent. Every internal
// credits⇄USD conversion — worker pay, treasury margin, referral cuts, the
// free/allowance subsidy caps — goes through this one. Redenominated 100 → 1000
// on the per-token repricing: a typical message costs about a tenth of a cent,
// and at the old cent-sized credit the smallest chargeable unit was ~14x the
// price of the thing being charged for.
//
// Every stored credit balance predates this and is denominated in cent-credits,
// so scripts/migrate-credit-redenomination.ts multiplies the ledger by 10 in the
// same release. Changing this constant without running that migration silently
// devalues every user balance tenfold.
export const CREDITS_PER_USD = 1000; // 1 credit = $0.001

// PURCHASE rate: how many credits one dollar BUYS on the pay-as-you-go door.
// Deliberately half the value rate. The gap is the point: pay-as-you-go buys a
// credit at $0.002 and spends it at $0.001, so a subscription is always the
// cheaper way to buy the same inference — the same shape Venice uses to make its
// tiers the default door. Only the deposit path may read this; anything valuing
// credits ALREADY HELD (worker pay, margin, referrals, subsidy caps) must use
// CREDITS_PER_USD, or it will value a user's balance at what they paid for it
// instead of what it is worth.
//
// USDC deposits are the only purchase rail (getConfiguredDepositTokens below);
// card/recurring rails are deferred to a later release.
export const CREDITS_PER_DOLLAR_PURCHASED = 500;

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

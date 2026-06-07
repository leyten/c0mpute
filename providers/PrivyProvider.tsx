'use client';

import { PrivyProvider as Privy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// External Solana wallet connectors (Phantom / Solflare / Backpack via the
// wallet-standard). Registered once at module load.
const solanaConnectors = toSolanaWalletConnectors();

export default function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  // During build/SSG or if app ID is missing, render children without Privy
  if (!appId) {
    return <>{children}</>;
  }

  return (
    <Privy
      appId={appId}
      config={{
        // Two ways in: X/Twitter and external Solana wallets. Everything in the
        // app is keyed on the Privy DID, so a wallet user gets a full account
        // (credits, free prompts, staking, billing) exactly like an X user.
        loginMethods: ['twitter', 'wallet'],

        // Control the FIRST login screen directly: surface each auto-detected
        // installed Solana wallet (Phantom/Brave/etc, via wallet-standard) as
        // its own button alongside X — no "continue with a wallet" intermediate
        // step. Users with no Solana wallet installed reach the named options
        // via overflow. (primary renders on the default screen.)
        loginMethodsAndOrder: {
          primary: ['detected_solana_wallets', 'twitter'],
          overflow: ['phantom', 'solflare', 'backpack'],
        },

        // Only external Solana wallets — ZERO lives on Solana. No EVM, no
        // Privy-embedded wallets; users connect Phantom/Solflare/Backpack etc.
        externalWallets: {
          solana: { connectors: solanaConnectors },
        },

        // Appearance - match c0mpute style
        appearance: {
          theme: '#000000', // Pure black background
          accentColor: '#FFFFFF', // White accent
          // logo removed to prevent empty src warning
          landingHeader: 'Login',
          loginMessage: 'Sign in with X or a Solana wallet',
          walletChainType: 'solana-only',
          // Show ONLY auto-detected installed Solana wallets first, then the
          // major Solana wallets as named options. Without an explicit
          // walletList Privy falls back to its default (EVM-heavy) list, which
          // is why the modal was showing every wallet under a generic picker.
          walletList: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack'],
        },
      }}
    >
      {children}
    </Privy>
  );
}

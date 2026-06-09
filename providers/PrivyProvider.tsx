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

        // Control the FIRST login screen directly. Most new users have neither a
        // Solana wallet nor any reason to connect one, and a wallet-first modal
        // reads as "crypto required" and bounces them. So X is the ONLY primary
        // button; all wallet options live behind "more options" (overflow) for
        // the crypto users who want them. (primary renders on the default screen.)
        loginMethodsAndOrder: {
          primary: ['twitter'],
          overflow: ['detected_solana_wallets', 'phantom', 'solflare', 'backpack'],
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
          landingHeader: 'Sign in to c0mpute',
          loginMessage: 'Sign in with X to get your free prompts — no card, no crypto needed.',
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

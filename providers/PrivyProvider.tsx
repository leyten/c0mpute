'use client';

import { PrivyProvider as Privy } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

// Only detect installed Solana wallet extensions
const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: false,
});

export default function PrivyProvider({ children }: { children: React.ReactNode }) {
  return (
    <Privy
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        // Login methods - Solana wallet only (enable 'twitter' in Privy Dashboard first)
        loginMethods: ['wallet', 'twitter'],
        
        // Appearance - match c0mpute style
        appearance: {
          theme: '#000000', // Pure black background
          accentColor: '#FFFFFF', // White accent
          // logo removed to prevent empty src warning
          landingHeader: 'Login',
          loginMessage: 'Connect your Solana wallet or X account',
          showWalletLoginFirst: true,
          walletChainType: 'solana-only',
          walletList: ['detected_solana_wallets'],
        },
        
        // Embedded wallet configuration for Solana
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },

        // External wallets - detect installed Solana wallets
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
        },
      }}
    >
      {children}
    </Privy>
  );
}

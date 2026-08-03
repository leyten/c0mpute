'use client';

// Custom /login page — replaces the default Privy modal. Privy still does the
// actual auth (X OAuth redirect + Sign-In-With-Solana), but headless, so the
// screen is fully ours: same DIDs, same accounts, zero backend changes.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Captcha, usePrivy, useLoginWithOAuth, useLoginWithSiws } from '@privy-io/react-auth';
import { getWallets } from '@wallet-standard/app';

const NEXT_KEY = 'c0mpute_login_next';

// Minimal wallet-standard shapes — the package ships wide types and we only
// touch connect + signMessage.
interface StandardWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  features: Record<string, unknown>;
  accounts: readonly { address: string; chains: readonly string[] }[];
}

function isSolanaSignInWallet(w: StandardWallet): boolean {
  return (
    w.chains.some((c) => c.startsWith('solana:')) &&
    'standard:connect' in w.features &&
    'solana:signMessage' in w.features
  );
}


function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated } = usePrivy();
  const { generateSiwsMessage, loginWithSiws } = useLoginWithSiws();

  const [wallets, setWallets] = useState<StandardWallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // 'x' | wallet name
  const [error, setError] = useState<string | null>(null);

  // The SDK's initOAuth throws "Captcha failed" INSTANTLY unless the invisible
  // captcha has already solved (it checks status === 'success' at call time and
  // never waits — verified in the bundle). Solving takes ~2-4s after load, so a
  // fast first click always failed while the second worked. Track solved state
  // to queue early clicks behind it; fail open if the captcha is disabled
  // app-side (no widget appears) or takes absurdly long (Turnstile outage).
  const [captchaSolved, setCaptchaSolved] = useState(false);
  useEffect(() => {
    if (captchaSolved) return;
    const probe = setTimeout(() => {
      if (!document.getElementById('cf-turnstile')) setCaptchaSolved(true);
    }, 2500);
    const failOpen = setTimeout(() => setCaptchaSolved(true), 10000);
    return () => {
      clearTimeout(probe);
      clearTimeout(failOpen);
    };
  }, [captchaSolved]);

  // Where to go after auth. Only same-site paths; default is chat.
  const next = useMemo(() => {
    const n = searchParams.get('next');
    return n && n.startsWith('/') && !n.startsWith('//') ? n : '/chat';
  }, [searchParams]);

  // Returning leg of the X OAuth redirect — Privy's hook finishes the login
  // automatically; we just show the pending state instead of idle buttons.
  const oauthReturning = !!searchParams.get('privy_oauth_code');

  const { initOAuth } = useLoginWithOAuth({
    onError: (err) => {
      setBusy(null);
      setError(typeof err === 'string' ? err : 'Sign-in with X failed. Try again.');
    },
  });

  // A click that lands before the captcha solves is queued (button just shows
  // its busy state) and fires from the effect below the moment it solves —
  // no greyed-out button, no dead first click.
  const queuedXRef = useRef(false);
  const fireXOAuth = useCallback(() => {
    initOAuth({ provider: 'twitter' }).catch(() => {
      setBusy(null);
      setError('Could not start X sign-in. Try again.');
    });
  }, [initOAuth]);
  useEffect(() => {
    if (captchaSolved && queuedXRef.current) {
      queuedXRef.current = false;
      fireXOAuth();
    }
  }, [captchaSolved, fireXOAuth]);

  // Installed Solana wallets via the wallet-standard registry (Phantom,
  // Solflare, Backpack, ... register themselves on page load).
  useEffect(() => {
    const registry = getWallets();
    const refresh = () =>
      setWallets((registry.get() as unknown as StandardWallet[]).filter(isSolanaSignInWallet));
    refresh();
    const offRegister = registry.on('register', refresh);
    const offUnregister = registry.on('unregister', refresh);
    return () => {
      offRegister();
      offUnregister();
    };
  }, []);

  // Already signed in (or just finished) → continue to the destination.
  useEffect(() => {
    if (!ready || !authenticated) return;
    const stored = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    router.replace(stored && stored.startsWith('/') && !stored.startsWith('//') ? stored : next);
  }, [ready, authenticated, next, router]);

  const signInWithX = useCallback(() => {
    setError(null);
    setBusy('x');
    // The OAuth round-trip loses component state; park the destination.
    sessionStorage.setItem(NEXT_KEY, next);
    if (!captchaSolved) {
      queuedXRef.current = true;
      return;
    }
    fireXOAuth();
  }, [captchaSolved, next, fireXOAuth]);

  const signInWithWallet = useCallback(
    async (wallet: StandardWallet) => {
      setError(null);
      setBusy(wallet.name);
      try {
        const connectFeature = wallet.features['standard:connect'] as {
          connect: () => Promise<{ accounts: readonly { address: string; chains: readonly string[] }[] }>;
        };
        const { accounts } = await connectFeature.connect();
        const account =
          accounts.find((a) => a.chains.some((c) => c.startsWith('solana:'))) ?? accounts[0];
        if (!account) throw new Error('Wallet returned no account');

        const message = await generateSiwsMessage({ address: account.address });
        const signFeature = wallet.features['solana:signMessage'] as {
          signMessage: (input: {
            account: unknown;
            message: Uint8Array;
          }) => Promise<readonly { signature: Uint8Array }[]>;
        };
        const [signed] = await signFeature.signMessage({
          account,
          message: new TextEncoder().encode(message),
        });
        if (!signed) throw new Error('Wallet did not sign the message');

        // Privy's server expects the signature BASE64-encoded — its own
        // internal SIWS flow does base64(signature); base58 gets decoded to
        // garbage and every login dies with "Invalid SIWS message and/or
        // nonce".
        await loginWithSiws({
          message,
          signature: btoa(String.fromCharCode(...signed.signature)),
          walletClientType: wallet.name.toLowerCase().split(' ')[0],
          connectorType: 'injected',
        });
        // The authenticated effect above handles the redirect.
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        setError(
          /reject|denied|cancel/i.test(msg)
            ? 'Signature request was cancelled.'
            : 'Wallet sign-in failed. Try again.'
        );
        setBusy(null);
      }
    },
    [generateSiwsMessage, loginWithSiws]
  );

  // Buttons look live immediately; early X clicks queue behind the captcha
  // (see queuedXRef) and the SIWS path waits internally, so neither needs a
  // visible captcha gate anymore.
  const pending = !ready || busy !== null || oauthReturning || authenticated;

  return (
    <div className="ui-readable min-h-screen bg-black flex flex-col items-center justify-center px-4 py-16">
      {/* Privy bot protection: the modal mounted this internally; a headless
          page must mount it itself or every SIWS login throws "Captcha failed".
          onSuccess/onExpire drive the button gate above — tokens expire after
          ~5 min and the widget re-solves itself, so the gate closes and reopens. */}
      <Captcha
        onSuccess={() => setCaptchaSolved(true)}
        onExpire={() => setCaptchaSolved(false)}
      />
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#141210] p-8 shadow-2xl">
        {/* Wordmark */}
        <div className="flex justify-center mb-6">
          <a href="/" className="cursor-pointer pixel-serif-logo text-white text-xl font-bold flex items-center">
            c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
          </a>
        </div>

        <h1 className="pixel-serif text-white text-2xl text-center mb-2">Sign in to c0mpute</h1>
        <p className="pixel-sans text-white/50 text-xs text-center mb-7 leading-relaxed">
          Sign in with X to start. Your first prompts are free.
        </p>

        {/* Primary: X */}
        <button
          onClick={signInWithX}
          disabled={pending}
          className="w-full pixel-serif py-3 rounded-xl bg-white text-black hover:bg-white/90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2.5"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          {oauthReturning || busy === 'x' ? 'Signing in with X...' : 'Continue with X'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-white/10" />
          <span className="pixel-sans text-white/30 text-xs">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Solana wallets */}
        {wallets.length > 0 ? (
          <div className="flex flex-col gap-2">
            {wallets.map((w) => (
              <button
                key={w.name}
                onClick={() => signInWithWallet(w)}
                disabled={pending}
                className="w-full pixel-sans text-sm text-white/80 hover:text-white py-2.5 px-4 rounded-xl border border-white/10 hover:border-white/25 bg-black/40 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2.5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={w.icon} alt="" width={16} height={16} className="rounded-[3px]" />
                {busy === w.name ? 'Waiting for wallet...' : w.name}
              </button>
            ))}
          </div>
        ) : (
          <p className="pixel-sans text-white/35 text-xs text-center leading-relaxed">
            No Solana wallet detected.{' '}
            <a
              href="https://phantom.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-white/60 transition-colors"
            >
              Install Phantom
            </a>{' '}
            to sign in with a wallet.
          </p>
        )}

        {error && (
          <p className="pixel-sans text-red-400/90 text-xs text-center mt-4 leading-relaxed">{error}</p>
        )}
      </div>

      <p className="pixel-sans text-white/40 text-xs text-center mt-6 leading-relaxed">
        New here? Your account is created the first time you sign in.
      </p>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary in the app router.
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <LoginInner />
    </Suspense>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnonGateModal from '@/components/AnonGateModal';
import SiteNav from '@/components/SiteNav';
import LifecycleScroll from '@/components/home/LifecycleScroll';
import Doors from '@/components/home/Doors';
import { LogoMark } from '@/components/Logo';
import { useBrand } from '@/components/BrandProvider';
import { useAuth } from '@/hooks/useAuth';

// Key for passing prompt to user page
const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';
// Signed anonymous-visitor token (lets new users run free prompts without login)
const ANON_TOKEN_KEY = 'c0mpute_anon_token';
// Referral attribution: code from /r/<code>, stored 30 days, bound at signup
const REF_KEY = 'c0mpute_ref';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [anonModalOpen, setAnonModalOpen] = useState(false);
  // How many free prompts we advertise. Server-configured (ANON_FREE_PROMPT_LIMIT);
  // /api/anon carries it back, and this only stands in until it answers.
  const [anonFreeLimit, setAnonFreeLimit] = useState(5);

  // Capture referral code from /r/<code> redirects (?ref=...). Last click
  // wins; binding happens server-side at signup, new accounts only.
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && /^[a-z0-9]{4,12}$/.test(ref)) {
      localStorage.setItem(REF_KEY, JSON.stringify({ code: ref, at: Date.now() }));
      // Drop ?ref from the URL so it doesn't linger in shares/bookmarks
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const brand = useBrand();
  const { isLoading, isAuthenticated, login } = useAuth();
  
  // Post-login routing moved to /login (?next=). If an authenticated user
  // lands here, just drop any stale abandoned hero prompt: it's written on
  // every keystroke-submit and survives in localStorage if the chat page
  // never got to consume it, which made later visits ghost-inject it.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      localStorage.removeItem(PENDING_PROMPT_KEY);
    }
  }, [isLoading, isAuthenticated]);
  
  
  const TOKEN_CA = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // Replace with actual CA
  
  const copyCA = () => {
    navigator.clipboard.writeText(TOKEN_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    // Store the prompt for the user page to pick up
    localStorage.setItem(PENDING_PROMPT_KEY, prompt.trim());

    if (isAuthenticated) {
      // Already logged in — go straight to chat
      router.push('/chat');
      return;
    }

    // Not logged in — get an anonymous free-prompt session so they can try it
    // WITHOUT signing in. Only fall back to the sign-in prompt if the daily free
    // budget is spent (capReached) or the request fails.
    try {
      const existing = localStorage.getItem(ANON_TOKEN_KEY);
      const res = await fetch('/api/anon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: existing || undefined }),
      });
      const data = await res.json();
      if (typeof data.limit === 'number') setAnonFreeLimit(data.limit);
      if (data.capReached || !data.token) {
        setAnonModalOpen(true);
        return;
      }
      localStorage.setItem(ANON_TOKEN_KEY, data.token);
      router.push('/chat');
    } catch {
      setAnonModalOpen(true);
    }
  };

  return (
    <div className="relative bg-background" style={{ overflow: 'visible' }}>
      {anonModalOpen && (
        <AnonGateModal
          mode="softlogin"
          freePromptLimit={anonFreeLimit}
          onClose={() => setAnonModalOpen(false)}
          onSignIn={() => { login(); setAnonModalOpen(false); }}
        />
      )}
      {/* Header */}
      <SiteNav />

      {/* Hero + the scroll story: one continuous globe stage */}
      <LifecycleScroll
        hero={
          <div className="w-full max-w-6xl mx-auto px-5 md:px-6">
            <div className="max-w-2xl mx-auto md:mx-0 text-center md:text-left space-y-6">
              <h1 className="pixel-serif text-fg text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                The founding layer<br />of decentralized AI
              </h1>
              <p className="pixel-sans text-fg-90 text-sm md:text-lg max-w-lg mx-auto md:mx-0">
                A permissionless network of user-owned GPUs doing verifiable AI work.
              </p>
              <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto md:mx-0 pt-2">
                <div className="flex gap-2 md:gap-3 items-stretch">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask the impossible..."
                    className="flex-1 pixel-sans bg-background border border-field rounded-xl text-fg placeholder:text-fg-50 px-3 md:px-4 py-3 focus:outline-none focus:border-field-focus transition-colors text-sm md:text-lg"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer bg-background text-fg border border-field rounded-xl px-3 md:px-4 py-3 flex items-center justify-center"
                    aria-label="Send"
                  >
                    {/* The asset is a white glyph, so on paper it is invisible.
                        Inverting is the whole fix: it is flat white on
                        transparent, and invert(1) makes it flat ink. */}
                    <img src="/PixelSendIcon.png" alt="Send" width={20} height={20} className="light:invert" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        }
      />



      {/* Doors */}
      <Doors />


      {/* Footer — full sitemap so the header doesn't have to be one */}
      <footer className="border-t border-fg/10 mt-8">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div>
              <a href="/" className="pixel-serif-logo text-fg text-lg flex items-center gap-2">
                {brand.mark ? (
                  <>
                    <LogoMark className="w-6 h-6 shrink-0" />
                    <span>Compute Network</span>
                  </>
                ) : (
                  <span>
                    c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
                  </span>
                )}
              </a>
              <p className="pixel-sans text-fg-40 text-xs mt-3 max-w-[220px]">
                AI infrastructure should be open, verifiable, and owned by the people who run it.
              </p>
            </div>
            <div>
              <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">PRODUCT</div>
              <div className="flex flex-col gap-2">
                <a href="/chat" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Chat</a>
                <a href="/create" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Create</a>
                <a href="/earn" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Earn</a>
                <a href={`${brand.urls.docs}/api`} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">API</a>
              </div>
            </div>
            <div>
              <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">NETWORK</div>
              <div className="flex flex-col gap-2">
                <a href={brand.urls.shard} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Map</a>
                <a href="https://github.com/leyten/shard" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Engine</a>
                <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Protocol</a>
              </div>
            </div>
            <div>
              <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3"><span className="dollar">$</span>ZERO</div>
              <div className="flex flex-col gap-2">
                <a href="/staking" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Staking</a>
                <a href="/treasury" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Treasury</a>
                <a href={brand.urls.data} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Data</a>
              </div>
            </div>
            <div>
              <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3">RESOURCES</div>
              <div className="flex flex-col gap-2">
                <a href={brand.urls.docs} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Docs</a>
                <a href={brand.urls.blog} target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Blog</a>
                <a href="https://x.com/c0mputeAI" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">X</a>
                <a href="https://t.me/c0mputeAI" target="_blank" rel="noopener noreferrer" className="pixel-sans text-fg-60 hover:text-fg transition-colors text-sm">Telegram</a>
              </div>
            </div>
          </div>

          {/* Operating entity + legal links. Reviewers look for the corporation by
              name, so this is not decorative. New brand only until cutover. */}
          {brand.legalFooter && (
            <div className="mt-10 pt-6 border-t border-fg/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="pixel-sans text-fg-40 text-xs">
                &copy; {new Date().getFullYear()} Compute Network Inc.
              </div>
              <div className="flex items-center gap-5">
                <a href="/terms" className="pixel-sans text-fg-40 hover:text-fg transition-colors text-xs">Terms</a>
                <a href="/privacy" className="pixel-sans text-fg-40 hover:text-fg transition-colors text-xs">Privacy</a>
                <a href="/acceptable-use" className="pixel-sans text-fg-40 hover:text-fg transition-colors text-xs">Acceptable Use</a>
              </div>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

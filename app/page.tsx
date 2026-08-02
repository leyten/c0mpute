'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnonGateModal from '@/components/AnonGateModal';
import SiteNav from '@/components/SiteNav';
import LifecycleScroll from '@/components/home/LifecycleScroll';
import Doors from '@/components/home/Doors';
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

  const { isLoading, isAuthenticated, login } = useAuth();
  
  // After the X OAuth round-trip, continue to chat — but only on the explicit
  // post-login flag (sessionStorage, so it dies with the tab). A leftover
  // PENDING_PROMPT_KEY alone must NOT redirect: it's written on every hero
  // keystroke-submit and survives in localStorage if the chat page never got
  // to consume it, which made every later login bounce straight to /chat.
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const postLogin = sessionStorage.getItem('c0mpute_post_login_redirect');
      if (postLogin) {
        sessionStorage.removeItem('c0mpute_post_login_redirect');
        router.push('/chat');
      } else {
        // No redirect intent this session — drop any stale abandoned prompt
        // so it can't ghost-inject into the next chat visit.
        localStorage.removeItem(PENDING_PROMPT_KEY);
      }
    }
  }, [isLoading, isAuthenticated, router]);
  
  
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
    <div className="relative bg-black" style={{ overflow: 'visible' }}>
      {anonModalOpen && (
        <AnonGateModal
          mode="softlogin"
          freePromptLimit={5}
          onClose={() => setAnonModalOpen(false)}
          onSignIn={() => { sessionStorage.setItem('c0mpute_post_login_redirect', '1'); login(); setAnonModalOpen(false); }}
        />
      )}
      {/* Header */}
      <SiteNav />

      {/* Hero + the scroll story: one continuous globe stage */}
      <LifecycleScroll
        hero={
          <div className="w-full max-w-6xl mx-auto px-5 md:px-6">
            <div className="max-w-2xl mx-auto md:mx-0 text-center md:text-left space-y-6">
              <h1 className="pixel-serif text-white text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                The founding layer<br />of decentralized AI
              </h1>
              <p className="pixel-sans text-white/90 text-sm md:text-lg max-w-lg mx-auto md:mx-0">
                A permissionless network of user-owned GPUs doing verifiable AI work.
              </p>
              <form onSubmit={handleSubmit} className="w-full max-w-xl mx-auto md:mx-0 pt-2">
                <div className="flex gap-2 md:gap-3 items-stretch">
                  <input
                    type="text"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask anything..."
                    className="flex-1 pixel-sans bg-black border border-[#2a2a2a] rounded-xl text-white placeholder:text-white/50 px-3 md:px-4 py-3 focus:outline-none focus:border-[#3a3a3a] transition-colors text-sm md:text-lg"
                  />
                  <button
                    type="submit"
                    className="cursor-pointer bg-black text-white border border-[#2a2a2a] rounded-xl px-3 md:px-4 py-3 flex items-center justify-center"
                    aria-label="Send"
                  >
                    <img src="/PixelSendIcon.png" alt="Send" width={20} height={20} />
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
      <footer className="border-t border-white/10 mt-8">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div>
              <a href="/" className="pixel-serif-logo text-white text-lg">
                c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
              </a>
              <p className="pixel-sans text-white/40 text-xs mt-3 max-w-[220px]">
                AI infrastructure should be open, verifiable, and owned by the people who run it.
              </p>
            </div>
            <div>
              <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">PRODUCT</div>
              <div className="flex flex-col gap-2">
                <a href="/chat" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Chat</a>
                <a href="/create" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Create</a>
                <a href="/earn" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Earn</a>
                <a href="https://docs.c0mpute.ai/api" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">API</a>
              </div>
            </div>
            <div>
              <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">NETWORK</div>
              <div className="flex flex-col gap-2">
                <a href="/#network" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Lifecycle</a>
                <a href="https://shard.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Map</a>
                <a href="https://github.com/leyten/shard" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Engine</a>
                <a href="https://docs.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Protocol</a>
              </div>
            </div>
            <div>
              <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3"><span className="dollar">$</span>ZERO</div>
              <div className="flex flex-col gap-2">
                <a href="/staking" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Staking</a>
                <a href="/treasury" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Treasury</a>
                <a href="https://data.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Data</a>
              </div>
            </div>
            <div>
              <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">RESOURCES</div>
              <div className="flex flex-col gap-2">
                <a href="https://docs.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Docs</a>
                <a href="https://blog.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Blog</a>
                <a href="https://x.com/c0mputeAI" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">X</a>
                <a href="https://t.me/c0mputeAI" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">Telegram</a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

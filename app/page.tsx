'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Inter, Newsreader } from 'next/font/google';
import './homepage-variants.css';
import AnonGateModal from '@/components/AnonGateModal';
import LifecycleScroll from '@/components/home/LifecycleScroll';
import Doors from '@/components/home/Doors';
import { useAuth } from '@/hooks/useAuth';

// Chosen theme: "Editorial" — Newsreader display, Inter body (leyten's pick).
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const newsreader = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-newsreader' });

// Key for passing prompt to user page
const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';
// Signed anonymous-visitor token (lets new users run free prompts without login)
const ANON_TOKEN_KEY = 'c0mpute_anon_token';
// Referral attribution: code from /r/<code>, stored 30 days, bound at signup
const REF_KEY = 'c0mpute_ref';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  const { isLoading, isAuthenticated, login, logout, displayName, xUsername, walletAddress } = useAuth();
  
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
  
  // Display: prefer X handle, fallback to wallet address
  const userDisplay = xUsername 
    ? `@${xUsername}` 
    : walletAddress 
      ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
      : 'User';
  
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
    <div className={`relative bg-black v-b ${inter.variable} ${newsreader.variable}`} style={{ overflow: 'visible' }}>
      {anonModalOpen && (
        <AnonGateModal
          mode="softlogin"
          freePromptLimit={5}
          onClose={() => setAnonModalOpen(false)}
          onSignIn={() => { sessionStorage.setItem('c0mpute_post_login_redirect', '1'); login(); setAnonModalOpen(false); }}
        />
      )}
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex-1">
              <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
              </a>
            </div>
            
            {/* Center: Navigation - Hidden on mobile */}
            <div className="hidden md:flex items-center gap-8">
              <a href="/chat" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Chat</a>
              <a href="/create" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Create</a>
              <a href="/earn" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Earn</a>
              <a href="/#network" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Network</a>
              {/* $ZERO dropdown: staking / treasury / data */}
              <div className="relative group">
                <span className="cursor-pointer pixel-sans text-white/70 group-hover:text-white transition-colors text-sm tracking-wide inline-flex items-center gap-1">
                  <span className="dollar">$</span>ZERO
                  <svg width="8" height="6" viewBox="0 0 8 6" fill="currentColor" className="mt-0.5"><path d="M0 0h8L4 6z" /></svg>
                </span>
                <div className="absolute left-1/2 -translate-x-1/2 top-full pt-3 hidden group-hover:block">
                  <div className="bg-black/95 border border-white/10 rounded-xl px-5 py-3 flex flex-col gap-3 whitespace-nowrap">
                    <a href="/staking" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Staking</a>
                    <a href="/treasury" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Treasury</a>
                    <a href="https://data.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Data</a>
                  </div>
                </div>
              </div>
              <a href="https://docs.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Docs</a>
              <a href="https://blog.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Blog</a>
            </div>
            
            {/* Right: X + Login (desktop) + Hamburger (mobile) */}
            <div className="flex-1 flex items-center justify-end gap-3">
              {/* GitHub Link */}
              <a
                href="https://github.com/leyten/c0mpute"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-white/70 hover:text-white transition-colors p-2"
                aria-label="View source on GitHub"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
              </a>

              {/* X (Twitter) Link */}
              <a
                href="https://x.com/c0mputeAI"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-white/70 hover:text-white transition-colors p-2"
                aria-label="Follow us on X"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>

              {/* Telegram Link */}
              <a
                href="https://t.me/c0mputeAI"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer text-white/70 hover:text-white transition-colors p-2"
                aria-label="Join us on Telegram"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
              </a>

              {isLoading ? (
                <div className="pixel-serif-logo text-sm px-3 md:px-4 py-2 border border-white/20 rounded-lg text-white/50">
                  ...
                </div>
              ) : isAuthenticated ? (
                <div className="relative">
                  <button 
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="cursor-pointer pixel-serif-logo text-sm px-3 md:px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors flex items-center gap-2">
                    {userDisplay}
                    <svg 
                      width="10" 
                      height="10" 
                      viewBox="0 0 10 10" 
                      fill="currentColor"
                      className={`transition-transform ${userMenuOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="M5 7L1 3h8L5 7z" />
                    </svg>
                  </button>
                  
                  {/* User Dropdown Menu */}
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 bg-black border border-white/20 rounded-lg min-w-[150px] z-50">
                      <a
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="cursor-pointer pixel-sans text-sm w-full px-4 py-3 text-left text-white/70 hover:text-white hover:bg-white/5 transition-colors block"
                      >
                        Settings
                      </a>
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="cursor-pointer pixel-sans text-sm w-full px-4 py-3 text-left text-white/70 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { sessionStorage.setItem('c0mpute_post_login_redirect', '1'); login(); }}
                  className="pixel-serif-logo text-sm px-3 md:px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors">
                  Login
                </button>
              )}
              
              {/* Hamburger Menu Button - Mobile only */}
              <button
                className="cursor-pointer md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="Toggle menu"
              >
                <span className={`block w-5 h-0.5 bg-white transition-transform ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block w-5 h-0.5 bg-white transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`block w-5 h-0.5 bg-white transition-transform ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
              </button>
            </div>
          </nav>
          
          {/* Mobile Menu Dropdown */}
          {menuOpen && (
            <div className="md:hidden bg-black/95 border border-white/10 border-t-0 rounded-b-2xl px-4 py-4 flex flex-col gap-4">
              <a
                href="/create"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Create
              </a>
              <a
                href="/chat"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Chat
              </a>
              <a
                href="/earn"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Earn
              </a>
              <a
                href="/#network"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Network
              </a>
              <a
                href="/staking"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Staking
              </a>
              <a
                href="/treasury"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Treasury
              </a>
              <a
                href="https://data.c0mpute.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Data
              </a>
              <a
                href="https://docs.c0mpute.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Docs
              </a>
              <a
                href="https://blog.c0mpute.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Blog
              </a>
              <a 
                href="https://x.com/c0mpute" 
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide flex items-center gap-2"
                onClick={() => setMenuOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                Follow on X
              </a>
              <a
                href="https://t.me/c0mputeAI"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide flex items-center gap-2"
                onClick={() => setMenuOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
                </svg>
                Join on Telegram
              </a>
              
              {/* Auth section in mobile menu */}
              <div className="border-t border-white/10 pt-4 mt-2">
                {isAuthenticated ? (
                  <>
                    <div className="pixel-sans text-white/70 text-xs mb-2">Logged in as</div>
                    <div className="pixel-sans text-white text-sm mb-4">{userDisplay}</div>
                    <a 
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide block mb-3"
                    >
                      Settings
                    </a>
                    <button 
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide block"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { sessionStorage.setItem('c0mpute_post_login_redirect', '1'); login(); setMenuOpen(false); }}
                    className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                  >
                    Login
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

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

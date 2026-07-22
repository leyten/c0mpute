'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Inter, Newsreader, Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import './homepage-variants.css';
import PixelBlast from '@/components/PixelBlast';
import OrchestratorFlow from '@/components/OrchestratorFlow';
import PrivateVisual from '@/components/PrivateVisual';
import BrowserVisual from '@/components/BrowserVisual';
import EarningsVisual from '@/components/EarningsVisual';
import AnonGateModal from '@/components/AnonGateModal';
import StatusBadge from '@/components/StatusBadge';
import LifecycleSpine from '@/components/LifecycleSpine';
import { useAuth } from '@/hooks/useAuth';

// Variant fonts (preview): A = Inter+mono, B = Newsreader serif, C = Space Grotesk
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const newsreader = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-newsreader' });
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' });
const jbMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

type Variant = 'a' | 'b' | 'c';
const VARIANT_KEY = 'c0mpute_preview_variant';

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
  const [hasScrolled, setHasScrolled] = useState(false);
  const [anonModalOpen, setAnonModalOpen] = useState(false);
  const [variant, setVariant] = useState<Variant>('a');

  // Preview-only: pick the type/color variant via ?v=a|b|c or the switcher
  // (persisted). URL param wins so each variant is directly linkable.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('v');
    const stored = localStorage.getItem(VARIANT_KEY);
    const pick = (v: string | null): v is Variant => v === 'a' || v === 'b' || v === 'c';
    if (pick(fromUrl)) { setVariant(fromUrl); localStorage.setItem(VARIANT_KEY, fromUrl); }
    else if (pick(stored)) setVariant(stored);
  }, []);

  const chooseVariant = (v: Variant) => {
    setVariant(v);
    localStorage.setItem(VARIANT_KEY, v);
  };

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

  // Hide scroll indicator after user scrolls
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setHasScrolled(true);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
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
    <div className={`relative bg-black v-${variant} ${inter.variable} ${newsreader.variable} ${grotesk.variable} ${jbMono.variable}`} style={{ overflow: 'visible' }}>
      {/* Preview-only variant switcher */}
      <div className="variant-switcher" title="Preview type/color variants">
        {(['a', 'b', 'c'] as Variant[]).map((v) => (
          <button key={v} className={variant === v ? 'on' : ''} onClick={() => chooseVariant(v)}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>
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
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
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

      {/* Hero Section - contains PixelBlast background */}
      <section className="relative h-screen overflow-hidden">
        {/* PixelBlast Background - contained within hero only */}
        <div className="absolute inset-0 z-0">
          <PixelBlast
            variant="circle"
            pixelSize={5}
            color="#ffffff"
            patternScale={3}
            patternDensity={1.0}
            enableRipples={false}
            speed={0.05}
            transparent={true}
            edgeFade={0.15}
            centerSparsity={1.5}
            className=""
            style={{ 
              width: '100%', 
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'block'
            }}
          />
        </div>
        
        {/* Hero Content */}
        <div className="relative z-10 flex flex-col items-center justify-center px-4 md:px-6 h-full">
          <div className="text-center space-y-6 md:space-y-8 max-w-5xl w-full -mt-24">
            <div className="space-y-4">
              <div className="pixel-serif-wrapper">
                <h1 className="pixel-serif text-white text-3xl md:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
                  The foundation layer<br />of decentralized AI
                </h1>
              </div>
              <p className="pixel-sans text-white/90 text-sm md:text-lg lg:text-xl max-w-2xl mx-auto px-4">
                A permissionless network of user-owned GPUs doing verifiable AI work.
              </p>
            </div>

            {/* Prompt Input */}
            <form onSubmit={handleSubmit} className="mt-6 md:mt-8 max-w-3xl mx-auto w-full px-2">
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

            <p className="pixel-sans text-white/60 text-xs md:text-sm max-w-xl mx-auto px-4 mt-6 flex items-center justify-center gap-2 flex-wrap">
              <StatusBadge state="live" />
              <span>The first product on the network answers today — free, no login.</span>
            </p>
          </div>
        </div>
        
        {/* Scroll indicator */}
        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-10 transition-opacity duration-500 ${hasScrolled ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div 
            className="flex flex-col items-center gap-2 cursor-pointer group" 
            onClick={() => window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })}
          >
            <span className="pixel-sans text-white/70 group-hover:text-white text-xs tracking-widest uppercase transition-colors">Scroll</span>
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 16 16" 
              fill="none" 
              className="text-white/70 group-hover:text-white transition-colors"
            >
              <path d="M8 2v12M3 9l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </div>
        </div>
      </section>

      {/* Refusal band — the category claim, stated as what we are not */}
      <section className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-4xl mx-auto px-4 md:px-6 text-center">
          <h2 className="pixel-serif text-white text-2xl md:text-4xl leading-snug">
            We don&apos;t rent out GPUs.<br />We deliver AI work that proves itself.
          </h2>
          <p className="pixel-sans text-white/60 text-sm md:text-base mt-6 max-w-2xl mx-auto">
            Every stage of every job signs a receipt — an audit trail the work carries with it. The first
            product on the network is live today; the betanet is launching.
          </p>
        </div>
      </section>

      {/* The Network — the lifecycle spine */}
      <section id="network" className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3 flex items-center justify-center gap-2">
              <span>THE NETWORK</span>
              <StatusBadge state="launching" />
            </div>
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">
              Torrent, but for compute
            </h2>
            <p className="pixel-sans text-white/70 text-sm md:text-base mt-4 max-w-2xl mx-auto">
              A model too big for any one machine is split into layers across GPUs people own. Instead of
              downloading the pieces, inference runs through them — and no node is essential. The lifecycle
              of a GPU on the network:
            </p>
          </div>

          <LifecycleSpine />

          {/* Dated, receipt-backed demonstrations — never live-service claims */}
          <div className="mt-12 md:mt-16">
            <h3 className="pixel-serif text-white text-xl md:text-2xl text-center mb-6 md:mb-8">
              Receipts, not promises
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
              <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
                <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">JUL 2026 · DEMONSTRATED</div>
                <h4 className="pixel-serif text-white text-lg mb-2">A stranger&apos;s home GPU served</h4>
                <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                  A residential 4090 behind a double NAT — mid-game — joined via relay hole-punch, torrented
                  its weights from a peer, and served a 200B+ model.
                </p>
              </div>
              <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
                <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">MEASURED · TEST RINGS</div>
                <h4 className="pixel-serif text-white text-lg mb-2">Interactive speed, scattered</h4>
                <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                  20–30 tokens per second per stream, measured on betanet test rings of scattered consumer
                  GPUs — no data-center interconnect anywhere.
                </p>
              </div>
              <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
                <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">JUL 2026 · DEMONSTRATED</div>
                <h4 className="pixel-serif text-white text-lg mb-2">Every byte verified</h4>
                <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                  Model weights pulled peer-first on real hardware with the mirror deliberately broken —
                  every block hash-verified against the signed manifest.
                </p>
              </div>
            </div>
            <div className="mt-8 text-center flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <a
                href="https://shard.c0mpute.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-xs md:text-sm transition-colors"
              >
                Network map (testbed preview) →
              </a>
              <a
                href="https://github.com/leyten/c0mpute"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-xs md:text-sm transition-colors"
              >
                Engine source →
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Verification as the moat */}
      <section id="verification" className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3">VERIFICATION</div>
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">
              Don&apos;t trust the node. Check the work.
            </h2>
            <p className="pixel-sans text-white/70 text-sm md:text-base mt-4 max-w-2xl mx-auto">
              Permissionless only works if lying doesn&apos;t. The moat isn&apos;t the GPUs — it&apos;s
              proving what they did.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            <div className="border-t border-white/15 pt-5 md:pt-6">
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Signed Receipts</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Every stage of every job emits a signed receipt: an activation hash-chain, the GPU that did
                it, real latencies, the output hash. The work carries its own audit trail.
              </p>
            </div>
            <div className="border-t border-white/15 pt-5 md:pt-6">
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Lossless Verify + Spot-Checks</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Speculative decoding re-checks tokens structurally — a stage whose outputs diverge is caught
                in the act. On top of that, random blocks are recomputed on trusted nodes and compared.
              </p>
            </div>
            <div className="border-t border-white/15 pt-5 md:pt-6">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="pixel-serif text-white text-lg md:text-xl">Reputation, Staking &amp; Slashing</h3>
                <StatusBadge state="roadmap" />
              </div>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Nodes will earn graded trust with every honest job, and trust will gate which roles they can
                hold. Staking buys the sensitive ones; detected cheating costs the stake. Skin in the game is
                what makes open membership safe.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Three doors */}
      <section id="doors" className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">Pick your door</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Door 1 — Developers */}
            <div id="developers" className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8 flex flex-col">
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Developers</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                One API, served by a network instead of a data center — every response backed by the receipts
                underneath it.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <a href="/chat" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Try it live →</a>
                <a href="https://docs.c0mpute.ai/api" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Betanet API — at launch →</a>
              </div>
              <a
                href="https://docs.c0mpute.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer pixel-serif-logo text-sm px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors text-center"
                style={{ marginTop: 'auto' }}
              >
                Read the docs
              </a>
            </div>
            {/* Door 2 — GPU owners */}
            <div id="gpu-owners" className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8 flex flex-col">
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">GPU Owners</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Your idle hardware earns USDC for real work — from a browser tab today, a full node when the
                betanet opens. No lock-in; leave whenever.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <a href="/earn" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Earn in your browser →</a>
                <a href="https://docs.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Run a full node — at launch →</a>
              </div>
              <a
                href="/earn"
                className="cursor-pointer pixel-serif-logo text-sm px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors text-center"
                style={{ marginTop: 'auto' }}
              >
                Start earning
              </a>
            </div>
            {/* Door 3 — Open-model community */}
            <div id="community" className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8 flex flex-col">
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">Open-Model Community</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Open models need open infrastructure to run on. Network revenue funds the treasury — half
                burns <span className="dollar">$</span>ZERO, half pays the people who stake it.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <a href="/treasury" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Treasury →</a>
                <a href="https://data.c0mpute.ai" target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">Network data →</a>
              </div>
              <a
                href="/staking"
                className="cursor-pointer pixel-serif-logo text-sm px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors text-center"
                style={{ marginTop: 'auto' }}
              >
                Explore <span className="dollar">$</span>ZERO
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Section — the live v1 product */}
      <section className="bg-black py-12 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">

          <div className="text-center mb-12 md:mb-16">
            <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3 flex items-center justify-center gap-2">
              <span>THE PRODUCT</span>
              <StatusBadge state="live" />
            </div>
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">
              The first product on the network
            </h2>
            <p className="pixel-sans text-white/70 text-sm md:text-base mt-4 max-w-2xl mx-auto">
              Chat, create, and earn — browser workers doing paid AI work today, settled in USDC.
            </p>
          </div>

          {/* Mobile: Stacked text-only cards */}
          <div className="md:hidden flex flex-col gap-4">
            {/* Card 1 - People Powered */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                People-Powered AI
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-2">
                Compute shared by people around the world — not hyperscale data centers — powering AI for everyone.
              </p>
            </div>
            
            {/* Card 2 - Privacy */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                Private by Design
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-2">
                We never store your prompts, and workers never see who you are.
              </p>
            </div>
            
            {/* Card 3 - Browser */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                In-Browser
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-2">
                No downloads. Just open and go.
              </p>
            </div>
            
            {/* Card 4 - Get Paid */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                Get Paid for Your Compute
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-2">
                Get paid in <span className="dollar">$</span>USDC for your computing power. Passive income just by keeping a tab open.
              </p>
            </div>
          </div>

          {/* Desktop: Bento Grid with visuals */}
          <div className="hidden md:grid grid-cols-5 grid-rows-2 gap-4 h-[750px]">
            {/* Row 1: Large + Small */}
            {/* Cell 1 - People Powered (large) */}
            <div className="col-span-3 border border-white/10 bg-white/[0.02] rounded-2xl p-8 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
              <h3 className="pixel-serif text-white text-2xl md:text-3xl">
                People-Powered AI
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-3">
                Compute shared by people around the world — not hyperscale data centers — powering AI for everyone.
              </p>
              {/* Orchestrator Flow Animation */}
              <div className="flex-1 flex items-center justify-center mt-4">
                <OrchestratorFlow />
              </div>
            </div>
            
            {/* Cell 2 - Privacy (small) */}
            <div className="col-span-2 border border-white/10 bg-white/[0.02] rounded-2xl p-6 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
              <h3 className="pixel-serif text-white text-xl">
                Private by Design
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-2">
                We never store your prompts,<br />and workers never see who you are.
              </p>
              {/* Privacy Visual */}
              <div className="flex-1 flex items-center justify-center mt-4">
                <PrivateVisual />
              </div>
            </div>
            
            {/* Row 2: Small + Large */}
            {/* Cell 3 - Browser (small) */}
            <div className="col-span-2 border border-white/10 bg-white/[0.02] rounded-2xl p-6 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
              <h3 className="pixel-serif text-white text-xl">
                In-Browser
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-2">
                No downloads. Just open and go.
              </p>
              {/* Browser Visual */}
              <div className="flex-1 flex items-center justify-center mt-4">
                <BrowserVisual />
              </div>
            </div>
            
            {/* Cell 4 - Get Paid (large) */}
            <div className="col-span-3 border border-white/10 bg-white/[0.02] rounded-2xl p-8 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
              <h3 className="pixel-serif text-white text-2xl md:text-3xl">
                Get Paid for Your Compute
              </h3>
              <p className="pixel-sans text-white/70 text-sm mt-3">
                Get paid in <span className="dollar">$</span>USDC for your computing power. Passive income just by keeping a tab open.
              </p>
              {/* Earnings Visual */}
              <div className="flex-1 flex items-center justify-center mt-4">
                <EarningsVisual />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Economic Model Section */}
      <section className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          
          {/* Section Header */}
          <div className="text-center mb-12 md:mb-16">
            <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3 flex items-center justify-center gap-2">
              <span>ECONOMICS</span>
              <StatusBadge state="live" />
            </div>
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">
              The <span className="dollar">$</span>ZERO Token
            </h2>
            <p className="pixel-sans text-white/70 text-sm md:text-base mt-4 max-w-2xl mx-auto">
              Revenue from compute and <span className="dollar">$</span>ZERO trading flows into the treasury. Half buys back and burns <span className="dollar">$</span>ZERO; half is paid to everyone who stakes it. The network&apos;s growth accrues straight to the token.
            </p>
          </div>


          {/* Three Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Step 1 */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/60 text-3xl md:text-4xl">01</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Revenue Funds the Treasury
              </h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                100% of the c0mpute margin and a share of every <span className="dollar">$</span>ZERO trade flow into the treasury, in <span className="dollar">$</span>USDC.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/60 text-3xl md:text-4xl">02</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Buyback &amp; Burn
              </h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Half the treasury buys <span className="dollar">$</span>ZERO on the open market and burns it. Supply shrinks as the network grows.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/60 text-3xl md:text-4xl">03</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Stake to Earn
              </h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Stake <span className="dollar">$</span>ZERO to earn the other half of the treasury in <span className="dollar">$</span>USDC. Workers who stake also earn a bigger share of every job they run.
              </p>
            </div>
          </div>

          {/* Bottom Note */}
          <div className="mt-12 md:mt-16 text-center">
            <p className="pixel-sans text-white/60 text-xs md:text-sm max-w-xl mx-auto">
              Token trading funds the network. AI for the people, by the people.
            </p>
            <a
              href="https://docs.c0mpute.ai/zero-token"
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-xs md:text-sm mt-3 inline-block transition-colors"
            >
              Learn more about <span className="dollar">$</span>ZERO →
            </a>
          </div>
        </div>
      </section>

      {/* Where this goes — the honest arc: launching → roadmap → research */}
      <section className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">Where this goes</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10">
            <div className="border-t border-white/15 pt-5 md:pt-6">
              <StatusBadge state="launching" />
              <h3 className="pixel-serif text-white text-lg md:text-xl mt-4 mb-3">The betanet</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Frontier models sharded across user-owned GPUs, served with receipts. The physics is proven
                in dated demonstrations; the public network around it is launching.
              </p>
            </div>
            <div className="border-t border-white/15 pt-5 md:pt-6">
              <StatusBadge state="roadmap" />
              <h3 className="pixel-serif text-white text-lg md:text-xl mt-4 mb-3">A control plane built to decentralize</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                The scheduler holds no weights and no user data by design — so control can move to the
                network without moving anyone&apos;s models or prompts.
              </p>
            </div>
            <div className="border-t border-white/15 pt-5 md:pt-6">
              <StatusBadge state="research" />
              <h3 className="pixel-serif text-white text-lg md:text-xl mt-4 mb-3">Verifiable training</h3>
              <p className="pixel-sans text-white/70 text-sm leading-relaxed">
                Same receipts, bigger jobs. Training on a permissionless network is our research frontier —
                we&apos;ll claim it when we&apos;ve proven it.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer — full sitemap so the header doesn't have to be one */}
      <footer className="border-t border-white/10 mt-8">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 md:py-14">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
            <div>
              <a href="/" className="pixel-serif-logo text-white text-lg">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
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
                <a href="https://github.com/leyten/c0mpute" target="_blank" rel="noopener noreferrer" className="pixel-sans text-white/60 hover:text-white transition-colors text-sm">GitHub</a>
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

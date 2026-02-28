'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PixelBlast from '@/components/PixelBlast';
import OrchestratorFlow from '@/components/OrchestratorFlow';
import PrivateVisual from '@/components/PrivateVisual';
import BrowserVisual from '@/components/BrowserVisual';
import EarningsVisual from '@/components/EarningsVisual';
import { useAuth } from '@/hooks/useAuth';

// Key for passing prompt to user page
const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';

export default function Home() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hasScrolled, setHasScrolled] = useState(false);
  
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
  
  // After auth loads, check if there's a pending prompt and user is now logged in
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      const pendingPrompt = localStorage.getItem(PENDING_PROMPT_KEY);
      if (pendingPrompt) {
        // User is logged in and has a pending prompt - redirect to chat
        router.push('/user');
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Homepage] handleSubmit called, prompt:', prompt);
    console.log('[Homepage] isLoading:', isLoading, 'isAuthenticated:', isAuthenticated);
    
    if (!prompt.trim()) {
      console.log('[Homepage] Empty prompt, returning');
      return;
    }
    
    // Store the prompt for the user page to pick up
    localStorage.setItem(PENDING_PROMPT_KEY, prompt.trim());
    console.log('[Homepage] Stored prompt in localStorage');
    
    if (isAuthenticated) {
      // Already logged in - go straight to chat
      console.log('[Homepage] User authenticated, redirecting to /user');
      router.push('/user');
    } else {
      // Not logged in - trigger login flow
      // After login completes, the useEffect above will detect the pending prompt and redirect
      console.log('[Homepage] User not authenticated, calling login()');
      login();
      console.log('[Homepage] login() called');
    }
  };

  return (
    <div className="relative bg-black" style={{ overflow: 'visible' }}>
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
              <a href="/user" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">User</a>
              <a href="/worker" className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Worker</a>
            </div>
            
            {/* Right: X + Login (desktop) + Hamburger (mobile) */}
            <div className="flex-1 flex items-center justify-end gap-3">
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
              
              {isLoading ? (
                <div className="pixel-serif-logo text-sm px-3 md:px-4 py-2 border border-white/20 rounded-lg text-white/50">
                  ...
                </div>
              ) : isAuthenticated ? (
                <div className="relative">
                  <button 
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="pixel-serif-logo text-sm px-3 md:px-4 py-2 border border-white/20 rounded-lg text-white hover:bg-white/5 transition-colors flex items-center gap-2">
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
                        className="pixel-sans text-sm w-full px-4 py-3 text-left text-white/70 hover:text-white hover:bg-white/5 transition-colors block"
                      >
                        Settings
                      </a>
                      <button
                        onClick={() => { logout(); setUserMenuOpen(false); }}
                        className="pixel-sans text-sm w-full px-4 py-3 text-left text-white/70 hover:text-white hover:bg-white/5 transition-colors border-t border-white/10"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button 
                  onClick={() => login()}
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
                href="/user" 
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                User
              </a>
              <a 
                href="/worker" 
                className="cursor-pointer pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Worker
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
              
              {/* Auth section in mobile menu */}
              <div className="border-t border-white/10 pt-4 mt-2">
                {isAuthenticated ? (
                  <>
                    <div className="pixel-sans text-white/50 text-xs mb-2">Logged in as</div>
                    <div className="pixel-sans text-white text-sm mb-4">{userDisplay}</div>
                    <a 
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide block mb-3"
                    >
                      Settings
                    </a>
                    <button 
                      onClick={() => { logout(); setMenuOpen(false); }}
                      className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide block"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => { login(); setMenuOpen(false); }}
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
                <h1 className="pixel-serif text-white text-4xl md:text-6xl lg:text-7xl font-bold leading-none tracking-tight">
                  C<span className="pixel-serif-logo" style={{ fontSize: '2em' }}>0</span>MPUTE
                </h1>
              </div>
              <p className="pixel-sans text-white/90 text-sm md:text-lg lg:text-xl max-w-2xl mx-auto px-4">
                AI powered by people, not data centers.
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
                  className="flex-1 pixel-sans bg-black border border-[#2a2a2a] rounded-xl text-white placeholder:text-white/40 px-3 md:px-4 py-3 focus:outline-none focus:border-[#3a3a3a] transition-colors text-sm md:text-lg"
                  style={{
                    fontSmooth: 'never',
                    WebkitFontSmoothing: 'none',
                    MozOsxFontSmoothing: 'unset'
                  }}
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

            <p className="pixel-sans text-white/50 text-xs md:text-sm max-w-xl mx-auto px-4 mt-6">
              A decentralized network where anyone can share compute and earn, while users get private, censorship-free AI.
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

      {/* Bento Grid Section */}
      <section className="bg-black py-12 md:py-24">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          
          {/* Mobile: Stacked text-only cards */}
          <div className="md:hidden flex flex-col gap-4">
            {/* Card 1 - People Powered */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                People-Powered AI
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                No data centers. No corporations. Just people around the world sharing compute to power AI for everyone.
              </p>
            </div>
            
            {/* Card 2 - Privacy */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                Private by Design
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                Your prompts are encrypted. Nobody sees what you ask.
              </p>
            </div>
            
            {/* Card 3 - Browser */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                In-Browser
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                No downloads. Just open and go.
              </p>
            </div>
            
            {/* Card 4 - Get Paid */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6">
              <h3 className="pixel-serif text-white text-xl">
                Get Paid for Your Compute
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                Get paid in <span className="dollar">$</span>SOL for your computing power. Passive income just by keeping a tab open.
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
              <p className="pixel-sans text-white/50 text-sm mt-3">
                No data centers. No corporations. Just people around the world sharing compute to power AI for everyone.
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
              <p className="pixel-sans text-white/50 text-sm mt-2">
                Your prompts are encrypted.<br />Nobody sees what you ask.
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
              <p className="pixel-sans text-white/50 text-sm mt-2">
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
              <p className="pixel-sans text-white/50 text-sm mt-3">
                Get paid in <span className="dollar">$</span>SOL for your computing power. Passive income just by keeping a tab open.
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
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">
              The <span className="dollar">$</span>ZERO Token
            </h2>
            <p className="pixel-sans text-white/50 text-sm md:text-base mt-4 max-w-2xl mx-auto">
              Hold <span className="dollar">$</span>ZERO to use c0mpute. Transaction fees fund the workers who power the total compute.
            </p>
          </div>


          {/* Three Steps */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {/* Step 1 */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/30 text-3xl md:text-4xl">01</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Hold <span className="dollar">$</span>ZERO to Use
              </h3>
              <p className="pixel-sans text-white/50 text-sm leading-relaxed">
                Buy and hold the <span className="dollar">$</span>ZERO token <br />to access c0mpute. Your tokens are your membership to decentralized AI.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/30 text-3xl md:text-4xl">02</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Trading Generates Fees
              </h3>
              <p className="pixel-sans text-white/50 text-sm leading-relaxed">
                Every buy and sell of <span className="dollar">$</span>ZERO generates transaction fees <br />in <span className="dollar">$</span>SOL. These fees flow into the worker reward pool.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/30 text-3xl md:text-4xl">03</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Workers Earn <span className="dollar">$</span>SOL
              </h3>
              <p className="pixel-sans text-white/50 text-sm leading-relaxed">
                Contributors who provide compute get paid from the fee pool in <span className="dollar">$</span>SOL. More trading activity = more rewards.
              </p>
            </div>
          </div>

          {/* Bottom Note */}
          <div className="mt-12 md:mt-16 text-center">
            <p className="pixel-sans text-white/30 text-xs md:text-sm max-w-xl mx-auto">
              Token trading funds the network. AI for the people, by the people.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

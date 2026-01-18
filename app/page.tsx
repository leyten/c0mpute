'use client';

import { useState } from 'react';
import PixelBlast from '@/components/PixelBlast';
import OrchestratorFlow from '@/components/OrchestratorFlow';
import PrivateVisual from '@/components/PrivateVisual';
import BrowserVisual from '@/components/BrowserVisual';
import EarningsVisual from '@/components/EarningsVisual';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const TOKEN_CA = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // Replace with actual CA
  
  const copyCA = () => {
    navigator.clipboard.writeText(TOKEN_CA);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      // TODO: Handle prompt submission
      console.log('Prompt submitted:', prompt);
      setPrompt('');
    }
  };

  return (
    <div className="relative bg-black" style={{ overflow: 'visible' }}>
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 px-4 md:px-6 py-3 flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex-1">
              <a href="/" className="pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
              </a>
            </div>
            
            {/* Center: Navigation - Hidden on mobile */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#user" className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">User</a>
              <a href="#worker" className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Worker</a>
            </div>
            
            {/* Right: Login (desktop) + Hamburger (mobile) */}
            <div className="flex-1 flex items-center justify-end gap-3">
              <a 
                href="#login" 
                className="pixel-serif-logo text-sm px-3 md:px-4 py-2 border border-white/20 text-white">
                Login
              </a>
              
              {/* Hamburger Menu Button - Mobile only */}
              <button
                className="md:hidden flex flex-col justify-center items-center w-8 h-8 gap-1.5"
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
            <div className="md:hidden bg-black/95 border border-white/10 border-t-0 px-4 py-4 flex flex-col gap-4">
              <a 
                href="#user" 
                className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                User
              </a>
              <a 
                href="#worker" 
                className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide"
                onClick={() => setMenuOpen(false)}
              >
                Worker
              </a>
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
            centerSparsity={0.4}
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
                A decentralized AI built from the collective compute of its users.
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
                  className="flex-1 pixel-sans bg-black border border-[#2a2a2a] text-white placeholder:text-white/40 px-3 md:px-4 py-3 focus:outline-none focus:border-[#3a3a3a] transition-colors text-sm md:text-lg"
                  style={{
                    fontSmooth: 'never',
                    WebkitFontSmoothing: 'none',
                    MozOsxFontSmoothing: 'unset'
                  }}
                />
                <button
                  type="submit"
                  className="bg-black text-white border border-[#2a2a2a] px-3 md:px-4 py-3 flex items-center justify-center"
                  aria-label="Send"
                >
                  <img src="/PixelSendIcon.png" alt="Send" width={20} height={20} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* Bento Grid Section */}
      <section className="bg-black py-12 md:py-24">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          
          {/* Mobile: Stacked text-only cards */}
          <div className="md:hidden flex flex-col gap-4">
            {/* Card 1 - People Powered */}
            <div className="border border-white/10 bg-white/[0.02] p-6">
              <h3 className="pixel-serif text-white text-xl">
                People-Powered AI
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                No data centers. No corporations. Just people around the world sharing compute to power AI for everyone.
              </p>
            </div>
            
            {/* Card 2 - Privacy */}
            <div className="border border-white/10 bg-white/[0.02] p-6">
              <h3 className="pixel-serif text-white text-xl">
                Private by Design
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                Your prompts are encrypted. Nobody sees what you ask.
              </p>
            </div>
            
            {/* Card 3 - Browser */}
            <div className="border border-white/10 bg-white/[0.02] p-6">
              <h3 className="pixel-serif text-white text-xl">
                In-Browser
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                No downloads. Just open and go.
              </p>
            </div>
            
            {/* Card 4 - Get Paid */}
            <div className="border border-white/10 bg-white/[0.02] p-6">
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
            <div className="col-span-3 border border-white/10 bg-white/[0.02] p-8 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
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
            <div className="col-span-2 border border-white/10 bg-white/[0.02] p-6 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
              <h3 className="pixel-serif text-white text-xl">
                Private by Design
              </h3>
              <p className="pixel-sans text-white/50 text-sm mt-2">
                Your prompts are encrypted. Nobody sees what you ask.
              </p>
              {/* Privacy Visual */}
              <div className="flex-1 flex items-center justify-center mt-4">
                <PrivateVisual />
              </div>
            </div>
            
            {/* Row 2: Small + Large */}
            {/* Cell 3 - Browser (small) */}
            <div className="col-span-2 border border-white/10 bg-white/[0.02] p-6 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
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
            <div className="col-span-3 border border-white/10 bg-white/[0.02] p-8 flex flex-col hover:bg-white/[0.04] transition-colors overflow-hidden">
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
            <div className="border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/30 text-3xl md:text-4xl">01</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Hold <span className="dollar">$</span>ZERO to Use
              </h3>
              <p className="pixel-sans text-white/50 text-sm leading-relaxed">
                Buy and hold the <span className="dollar">$</span>ZERO token to access c0mpute. Your tokens are your membership to decentralized AI.
              </p>
            </div>
            
            {/* Step 2 */}
            <div className="border border-white/10 bg-white/[0.02] p-6 md:p-8">
              <div className="flex items-center gap-3 mb-4">
                <span className="pixel-serif text-white/30 text-3xl md:text-4xl">02</span>
              </div>
              <h3 className="pixel-serif text-white text-lg md:text-xl mb-3">
                Trading Generates Fees
              </h3>
              <p className="pixel-sans text-white/50 text-sm leading-relaxed">
                Every buy and sell of <span className="dollar">$</span>ZERO generates transaction fees in <span className="dollar">$</span>SOL. These fees flow into the worker reward pool.
              </p>
            </div>
            
            {/* Step 3 */}
            <div className="border border-white/10 bg-white/[0.02] p-6 md:p-8">
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

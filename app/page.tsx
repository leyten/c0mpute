'use client';

import { useState } from 'react';
import PixelBlast from '@/components/PixelBlast';
import OrchestratorFlow from '@/components/OrchestratorFlow';
import PrivateVisual from '@/components/PrivateVisual';
import BrowserVisual from '@/components/BrowserVisual';
import EarningsVisual from '@/components/EarningsVisual';

export default function Home() {
  const [prompt, setPrompt] = useState('');

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
        <div className="max-w-6xl mx-auto px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 px-6 py-3 flex items-center justify-between">
            {/* Left: Logo */}
            <div className="flex-1">
              <a href="/" className="pixel-serif-logo text-white text-xl font-bold flex items-center">
                C<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>MPUTE
              </a>
            </div>
            
            {/* Center: Navigation */}
            <div className="flex items-center gap-8">
              <a href="#user" className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">User</a>
              <a href="#worker" className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">Worker</a>
            </div>
            
            {/* Right: Login */}
            <div className="flex-1 flex items-center justify-end">
              <a 
                href="#login" 
                className="pixel-serif-logo text-sm px-4 py-2 border border-white/20 text-white">
                Login
              </a>
            </div>
          </nav>
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
        <div className="relative z-10 flex flex-col items-center justify-center px-6 h-full">
          <div className="text-center space-y-8 max-w-5xl w-full -mt-24">
            <div className="space-y-4">
              <div className="pixel-serif-wrapper">
                <h1 className="pixel-serif text-white text-5xl md:text-6xl lg:text-7xl font-bold leading-none tracking-tight">
                  C<span className="pixel-serif-logo" style={{ fontSize: '2em' }}>0</span>MPUTE
                </h1>
              </div>
              <p className="pixel-sans text-white/90 text-base md:text-lg lg:text-xl max-w-2xl mx-auto">
                A decentralized AI built from the collective compute of its users.
              </p>
            </div>

            {/* Prompt Input */}
            <form onSubmit={handleSubmit} className="mt-8 max-w-3xl mx-auto w-full">
              <div className="flex gap-3 items-stretch">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ask anything..."
                  className="flex-1 pixel-sans bg-black border border-[#2a2a2a] text-white placeholder:text-white/40 px-4 py-3 focus:outline-none focus:border-[#3a3a3a] transition-colors text-base md:text-lg"
                  style={{
                    fontSmooth: 'never',
                    WebkitFontSmoothing: 'none',
                    MozOsxFontSmoothing: 'unset'
                  }}
                />
                <button
                  type="submit"
                  className="bg-black text-white border border-[#2a2a2a] px-4 py-3 flex items-center justify-center"
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
      <section className="bg-black py-24">
        <div className="max-w-6xl mx-auto px-6">
          {/* Bento Grid */}
          <div className="grid grid-cols-5 grid-rows-2 gap-4 h-[750px]">
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
                Get paid in $SOL for your computing power. Passive income just by keeping a tab open.
              </p>
              {/* Earnings Visual */}
              <div className="flex-1 flex items-center justify-center mt-4">
                <EarningsVisual />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

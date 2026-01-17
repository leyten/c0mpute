'use client';

import { useState } from 'react';
import PixelBlast from '@/components/PixelBlast';

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
              <a href="#about" className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">About</a>
              <a href="#how-it-works" className="pixel-sans text-white/70 hover:text-white transition-colors text-sm tracking-wide">How It Works</a>
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
          <div className="grid grid-cols-4 grid-rows-2 gap-4 h-[600px]">
            {/* Cell 1 - Large left cell (2x2) */}
            <div className="col-span-2 row-span-2 border border-white/10 bg-white/[0.02] p-8 flex flex-col justify-between hover:bg-white/[0.04] transition-colors">
              <div>
                <span className="pixel-sans text-white/40 text-xs tracking-[0.2em] uppercase">01</span>
                <h3 className="pixel-serif text-white text-2xl md:text-3xl mt-4">
                  Decentralized Computing
                </h3>
                <p className="pixel-sans text-white/60 text-sm mt-4 leading-relaxed">
                  Harness the collective power of distributed nodes. Your compute, your network.
                </p>
              </div>
            </div>
            
            {/* Cell 2 - Top right (2x1) */}
            <div className="col-span-2 border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between hover:bg-white/[0.04] transition-colors">
              <span className="pixel-sans text-white/40 text-xs tracking-[0.2em] uppercase">02</span>
              <div>
                <h3 className="pixel-serif text-white text-xl mt-2">
                  AI-Native
                </h3>
                <p className="pixel-sans text-white/60 text-sm mt-2 leading-relaxed">
                  Built from the ground up for machine learning workloads.
                </p>
              </div>
            </div>
            
            {/* Cell 3 - Bottom middle (1x1) */}
            <div className="col-span-1 border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between hover:bg-white/[0.04] transition-colors">
              <span className="pixel-sans text-white/40 text-xs tracking-[0.2em] uppercase">03</span>
              <div>
                <h3 className="pixel-serif text-white text-lg">
                  Open Source
                </h3>
              </div>
            </div>
            
            {/* Cell 4 - Bottom right (1x1) */}
            <div className="col-span-1 border border-white/10 bg-white/[0.02] p-6 flex flex-col justify-between hover:bg-white/[0.04] transition-colors">
              <span className="pixel-sans text-white/40 text-xs tracking-[0.2em] uppercase">04</span>
              <div>
                <h3 className="pixel-serif text-white text-lg">
                  Zero Trust
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

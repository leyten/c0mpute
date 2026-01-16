'use client';

import PixelBlast from '@/components/PixelBlast';

export default function Home() {
  return (
    <div className="relative min-h-screen bg-black">
      {/* Background */}
      <div 
        className="fixed inset-0"
        style={{ 
          width: '100vw', 
          height: '100vh',
          zIndex: 0
        }}
      >
        <PixelBlast
          variant="circle"
          pixelSize={5}
          color="#ffffff"
          patternScale={3}
          patternDensity={0.5}
          enableRipples={false}
          speed={0.05}
          transparent={true}
          edgeFade={0.08}
          className=""
          style={{ 
            width: '100vw', 
            height: '100vh',
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'block'
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-white/10">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="pixel-serif-logo text-white text-2xl font-bold">
            C<span className="pixel-serif-logo" style={{ fontSize: '2em' }}>0</span>MPUTE
          </div>
          <div className="flex items-center gap-6">
            <a href="#about" className="pixel-sans text-white/80 hover:text-white transition-colors">About</a>
            <a href="#how-it-works" className="pixel-sans text-white/80 hover:text-white transition-colors">How It Works</a>
            <a href="#join" className="pixel-sans text-white/80 hover:text-white transition-colors">Join</a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="text-center space-y-6 max-w-5xl">
          <div className="pixel-serif-wrapper">
            <h1 className="pixel-serif text-white text-7xl md:text-8xl lg:text-[12rem] font-bold leading-none tracking-tight">
              C<span className="pixel-serif-logo" style={{ fontSize: '2em' }}>0</span>MPUTE
            </h1>
          </div>
          <p className="pixel-sans text-white/95 text-lg md:text-xl lg:text-2xl max-w-3xl mx-auto">
            A decentralized AI built from the collective compute of its users.
          </p>
          <div className="flex gap-4 justify-center mt-8">
            <button className="px-8 py-3 border-2 border-white text-white pixel-sans hover:bg-white hover:text-black transition-colors">
              Get Started
            </button>
            <button className="px-8 py-3 border-2 border-white/50 text-white/80 pixel-sans hover:border-white hover:text-white transition-colors">
              Learn More
            </button>
          </div>
        </div>
      </section>


      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 mt-20">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="pixel-serif-logo text-white text-xl font-bold">
              C<span className="pixel-o-small" style={{ fontSize: '1.5em' }}>0</span>MPUTE
            </div>
            <div className="flex gap-6 pixel-sans text-white/60 text-sm">
              <a href="#" className="hover:text-white transition-colors">Privacy</a>
              <a href="#" className="hover:text-white transition-colors">Terms</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
            <div className="pixel-sans text-white/60 text-sm">
              © 2024 c0mpute. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

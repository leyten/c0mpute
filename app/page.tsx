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
      <header className="relative z-10">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black via-black/60 via-black/30 to-transparent pointer-events-none"></div>
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between relative z-10">
        <div className="pixel-serif-logo text-white text-2xl font-bold flex items-center">
          C<span className="pixel-serif-logo" style={{ fontSize: '2em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.35em' }}>0</span>MPUTE
        </div>
          <div className="flex items-center gap-6">
            <a href="#about" className="pixel-sans text-white/80 hover:text-white transition-colors">About</a>
            <a href="#how-it-works" className="pixel-sans text-white/80 hover:text-white transition-colors">How It Works</a>
            <>
              <style dangerouslySetInnerHTML={{__html: `
                a.login-link:not(:hover)::before {
                  transition-delay: 299ms;
                }
                a.login-link:not(:hover)::after {
                  transition-delay: 0ms;
                }
              `}} />
              <a href="#login" className="login-link pixel-serif text-white hover:text-white transition-colors relative before:absolute before:bottom-0 before:left-0 before:h-0.5 before:bg-white before:w-0 before:transition-all before:duration-300 hover:before:w-[42%] after:absolute after:bottom-0 after:left-[58%] after:h-0.5 after:bg-white after:w-0 after:transition-all after:duration-300 after:delay-[299ms] hover:after:w-[42%]">Login</a>
            </>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 flex flex-col items-center justify-center min-h-[calc(100vh-80px)] px-6 py-12">
        <div className="text-center space-y-6 max-w-5xl">
          <div className="pixel-serif-wrapper">
            <h1 className="pixel-serif text-white text-5xl md:text-6xl lg:text-7xl font-bold leading-none tracking-tight">
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

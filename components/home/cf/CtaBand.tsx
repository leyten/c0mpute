'use client';

// The closing band: an ink card asking for a decision, not a prompt — the
// composer lives in the hero only. One primary action, two arrow links, and
// the trust strip welded to the card's bottom edge.
import Reveal from './Reveal';

export default function CtaBand() {
  return (
    <section className="px-2">
      <Reveal className="ink-card rounded-[24px] max-w-[1480px] mx-auto text-center">
        <div className="ink-glow" aria-hidden />
        <div className="relative z-10 max-w-4xl mx-auto px-5 md:px-6 pt-20 md:pt-32 pb-16 md:pb-24 flex flex-col items-center gap-6 md:gap-8">
          <h2 className="rv pixel-serif text-white text-4xl md:text-[56px] leading-tight md:leading-[0.99] tracking-tight">
            Put your GPU to work.
          </h2>
          <p
            className="rv pixel-sans text-white/75 text-sm md:text-[19px] max-w-2xl"
            style={{ '--d': '0.1s' } as React.CSSProperties}
          >
            Plug in from a browser tab and earn USDC for real work, starting today.
          </p>
          <div className="rv flex flex-col sm:flex-row items-center gap-4 sm:gap-6" style={{ '--d': '0.2s' } as React.CSSProperties}>
            <a href="/earn" className="hdr-btn hdr-btn-primary pixel-sans text-sm font-medium" style={{ '--fg': '#ffffff', '--on-fg': '#0c0a09' } as React.CSSProperties}>
              <span>Start earning</span>
            </a>
            <a href="/chat" className="cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors">
              Try the chat →
            </a>
            <a href="/staking" className="cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors">
              Explore <span className="dollar">$</span>ZERO →
            </a>
          </div>
        </div>
        <div className="relative z-10 h-12 border-t border-white/15 flex items-center justify-center gap-3 md:gap-8 px-4">
          <span className="pixel-sans text-white/50 text-[10px] md:text-xs tracking-widest">OPEN MODELS</span>
          <span className="text-white/30 text-xs" aria-hidden>·</span>
          <span className="pixel-sans text-white/50 text-[10px] md:text-xs tracking-widest">USER-OWNED GPUS</span>
          <span className="text-white/30 text-xs" aria-hidden>·</span>
          <span className="pixel-sans text-white/50 text-[10px] md:text-xs tracking-widest">PAID IN USDC</span>
        </div>
      </Reveal>
    </section>
  );
}

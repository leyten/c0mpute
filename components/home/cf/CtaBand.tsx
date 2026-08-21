'use client';

// The closing band in the reference's build-CTA grammar: one full-bleed ink
// card, centred display headline, the composer handed back to the reader,
// and a thin bordered strip along the bottom edge.
import Composer from './Composer';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';

export default function CtaBand({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  return (
    <section className="px-2">
      <Reveal className="ink-card rounded-2xl max-w-[1480px] mx-auto text-center">
        <div className="ink-glow" aria-hidden />
        <CornerMarks onInk />
        <div className="relative z-10 max-w-4xl mx-auto px-5 md:px-6 pt-20 md:pt-32 pb-16 md:pb-24 flex flex-col items-center gap-6 md:gap-10">
          <h2 className="rv pixel-serif text-white text-4xl md:text-[56px] leading-tight md:leading-[0.99] tracking-tight">
            Ask the impossible.
          </h2>
          <p
            className="rv pixel-sans text-white/75 text-sm md:text-[19px] max-w-2xl"
            style={{ '--d': '0.1s' } as React.CSSProperties}
          >
            Your first prompts are free, answered by the network.
          </p>
          <div className="rv w-full max-w-xl" style={{ '--d': '0.2s' } as React.CSSProperties}>
            <Composer onSubmit={onSubmit} />
          </div>
          <div className="rv flex items-center gap-6" style={{ '--d': '0.3s' } as React.CSSProperties}>
            <a href="/earn" className="cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors">
              Start earning →
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

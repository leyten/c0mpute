'use client';

// The hero in the reference grammar: one full-bleed ink card (1480) that the
// transparent header floats over, carrying the headline (word-staggered
// entrance with the blur), the one-line pitch, and the product composer as
// the CTA. The card's life is the dot-wave plus the warm dome glow.
import Composer from './Composer';
import DotWave from './DotWave';
import Reveal from './Reveal';

const WORDS: { w: string; br?: boolean }[] = [
  { w: 'An' }, { w: 'open' }, { w: 'protocol' }, { w: 'for' },
  { w: 'decentralized', br: true }, { w: 'AI' },
];

export default function HeroCard({ onSubmit }: { onSubmit: (prompt: string) => void }) {
  return (
    <section id="home-hero" className="px-2 pt-[54px] md:pt-[72px]">
      <Reveal className="ink-card rounded-[24px] max-w-[1480px] mx-auto">
        <div
          className="absolute inset-0"
          style={{
            maskImage: 'linear-gradient(to bottom, transparent, black 22%)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 22%)',
          }}
        >
          <DotWave />
        </div>
        <div className="ink-copy-shield" aria-hidden />
        <div className="ink-glow" aria-hidden />
        <div className="relative z-10 max-w-4xl mx-auto px-5 md:px-6 pt-20 md:pt-32 pb-20 md:pb-28 text-center flex flex-col items-center gap-6 md:gap-10">
          <h1 className="pixel-serif text-white text-4xl md:text-[56px] leading-tight md:leading-[0.99] tracking-tight">
            {WORDS.map((x, k) => (
              <span key={k}>
                {x.br && <br />}
                <span className="rv-word" style={{ '--d': `${k * 0.05}s` } as React.CSSProperties}>
                  {x.w}
                  {k < WORDS.length - 1 ? ' ' : ''}
                </span>
              </span>
            ))}
          </h1>
          <p
            className="rv pixel-sans text-white/75 text-sm md:text-[19px] leading-relaxed max-w-[700px]"
            style={{ '--d': '0.35s' } as React.CSSProperties}
          >
            A permissionless network of user-owned GPUs that funds inference and training of open models.
          </p>
          <div className="rv w-full max-w-xl" style={{ '--d': '0.5s' } as React.CSSProperties}>
            <Composer
              onSubmit={onSubmit}
              chips={[
                'Explain how a torrent works to a ten-year-old',
                'Write a haiku about idle GPUs',
                'Plan a weekend in Prague on a budget',
              ]}
            />
          </div>
          <div className="rv flex flex-col items-center gap-2" style={{ '--d': '0.6s' } as React.CSSProperties}>
            <p className="pixel-sans text-white/50 text-xs">
              Free to try. No account needed. Answered by Qwen3.8 27B, running on machines people own.
            </p>
            <a href="/create" className="cursor-pointer pixel-sans text-white/60 hover:text-white text-xs transition-colors">
              Generate images →
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

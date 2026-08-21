'use client';

// The closing band: ownership. The token door promoted to a full ink band —
// who owns the network and how the money works, with the treasury's own
// numbers (fetched from the app's treasury API; the number row hides if the
// fetch fails or the program hasn't launched). One primary action.
import { useEffect, useState } from 'react';
import Reveal from './Reveal';
import { useBrand } from '@/components/BrandProvider';

const fmtZero = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n));
const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export default function CtaBand() {
  const brand = useBrand();
  const [t, setT] = useState<{ burned: number; returnedUsd: number; staked: number } | null>(null);
  useEffect(() => {
    fetch('/api/treasury')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.launched) return;
        const burned = d.totalZeroBurned ?? 0;
        const returnedUsd = (d.totalUsdBuybackSpent ?? 0) + (d.totalStakerRewardsPaid ?? 0);
        const staked = d.totalStaked ?? 0;
        if (burned > 0 || returnedUsd > 0) setT({ burned, returnedUsd, staked });
      })
      .catch(() => {});
  }, []);

  return (
    <section className="px-2">
      <Reveal className="ink-card rounded-[24px] max-w-[1480px] mx-auto text-center">
        <div className="ink-glow" aria-hidden />
        <div className="relative z-10 max-w-4xl mx-auto px-5 md:px-6 pt-20 md:pt-28 pb-16 md:pb-20 flex flex-col items-center gap-6 md:gap-8">
          <h2 className="rv pixel-serif text-white text-4xl md:text-[56px] leading-tight md:leading-[0.99] tracking-tight">
            Owned by the people who run it.
          </h2>
          <p
            className="rv pixel-sans text-white/75 text-sm md:text-[19px] max-w-2xl"
            style={{ '--d': '0.1s' } as React.CSSProperties}
          >
            Network revenue funds the treasury. Half buys back and burns{' '}
            <span className="dollar">$</span>ZERO. Half is paid to stakers in USDC.
          </p>
          {t && (
            <div className="rv grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-12 pt-2" style={{ '--d': '0.18s' } as React.CSSProperties}>
              {[
                { n: fmtZero(t.burned), l: <><span className="dollar">$</span>ZERO burned</> },
                { n: fmtUsd(t.returnedUsd), l: 'returned to holders and stakers' },
                { n: fmtZero(t.staked), l: <><span className="dollar">$</span>ZERO staked</> },
              ].map((c, i) => (
                <div key={i}>
                  <div className="pixel-serif text-white text-2xl md:text-3xl">{c.n}</div>
                  <div className="pixel-sans text-white/50 text-xs mt-1.5">{c.l}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rv flex flex-col sm:flex-row items-center gap-4 sm:gap-8" style={{ '--d': '0.26s' } as React.CSSProperties}>
            <a href="/staking" className="hdr-btn hdr-btn-primary pixel-sans text-sm font-medium" style={{ '--fg': '#ffffff', '--on-fg': '#0c0a09' } as React.CSSProperties}>
              <span>Stake <span className="dollar">$</span>ZERO</span>
            </a>
            <a href="/treasury" className="cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors">
              Treasury →
            </a>
            <a href={brand.urls.data} target="_blank" rel="noopener noreferrer" className="cursor-pointer pixel-sans text-white/70 hover:text-white text-sm transition-colors">
              Network data →
            </a>
          </div>
        </div>
        <div className="relative z-10 h-12 border-t border-white/15 flex items-center justify-center gap-3 md:gap-8 px-4">
          <span className="pixel-sans text-white/70 text-[10px] md:text-xs tracking-widest">OPEN MODELS</span>
          <span className="text-white/45 text-xs" aria-hidden>·</span>
          <span className="pixel-sans text-white/70 text-[10px] md:text-xs tracking-widest">USER-OWNED GPUS</span>
          <span className="text-white/45 text-xs" aria-hidden>·</span>
          <span className="pixel-sans text-white/70 text-[10px] md:text-xs tracking-widest">PAID IN USDC</span>
        </div>
      </Reveal>
    </section>
  );
}

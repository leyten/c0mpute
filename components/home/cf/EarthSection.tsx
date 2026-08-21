'use client';

// The network section in the reference's "Region: Earth" grammar: a centred
// title block, the rotating globe (bottom-clipped by its container), and a
// three-cell hairline fact panel underneath.
import { useCallback, useRef } from 'react';
import CfGlobe from './CfGlobe';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';
import StatusBadge from '@/components/StatusBadge';

const CELLS: { t: string; p: React.ReactNode }[] = [
  {
    t: 'Permissionless',
    p: 'Any GPU can join from a browser tab today, or as a full node when the betanet opens.',
  },
  {
    t: 'Verified',
    p: 'Every token is signed by the machine that produced it. Work that fails verification is never paid.',
  },
  {
    t: 'Owned by its operators',
    p: (
      <>
        Network revenue funds the treasury: half burns <span className="dollar">$</span>ZERO, half pays
        the people who stake it.
      </>
    ),
  },
];

export default function EarthSection() {
  const globeWrapRef = useRef<HTMLDivElement>(null);
  const onGlobeReady = useCallback(() => {
    globeWrapRef.current?.classList.add('on');
  }, []);

  return (
    <section id="network" className="px-4 md:px-6">
      <Reveal className="max-w-[1080px] mx-auto text-center flex flex-col items-center gap-4">
        <div className="rv pixel-sans text-fg-40 text-xs tracking-widest flex items-center justify-center gap-2">
          <span>THE NETWORK</span>
          <StatusBadge state="launching" />
        </div>
        <h2 className="rv pixel-serif text-fg text-3xl md:text-5xl" style={{ '--d': '0.08s' } as React.CSSProperties}>
          Torrent, but for compute
        </h2>
        <p
          className="rv pixel-sans text-fg-60 text-sm md:text-[19px] max-w-[700px]"
          style={{ '--d': '0.16s' } as React.CSSProperties}
        >
          Every model is split across user-owned GPUs that together hold one full copy.
        </p>
      </Reveal>
      <div
        ref={globeWrapRef}
        className="globe-enter relative mx-auto max-w-[1200px] h-[420px] md:h-[500px] overflow-hidden mt-4"
      >
        <CfGlobe onReady={onGlobeReady} />
      </div>
      <Reveal className="relative max-w-[1200px] mx-auto border border-fg/10 rounded-xl bg-background grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-fg/10">
        <CornerMarks />
        {CELLS.map((c, i) => (
          <div key={c.t} className="rv p-6 md:p-8" style={{ '--d': `${i * 0.08}s` } as React.CSSProperties}>
            <h3 className="pixel-sans text-fg text-lg font-medium">{c.t}</h3>
            <p className="pixel-sans text-fg-60 text-base mt-2 leading-relaxed">{c.p}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

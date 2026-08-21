'use client';

// The network section: title voice block, then the globe standing in a
// tinted 1000-wide art region with the 1200 fact strip pulled up over its
// bottom edge — a wider plinth in front of a narrower object. The strip is
// the page's ONLY marked panel: square corners, hairline, registration
// squares. (Marks mean "measured to the grid", and scarcity is what makes
// them read that way.)
import { useCallback, useRef } from 'react';
import CfGlobe from './CfGlobe';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';

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
        <h2 className="rv pixel-serif text-fg text-3xl md:text-5xl">Torrent, but for compute</h2>
        <p
          className="rv pixel-sans text-fg-60 text-sm md:text-[19px] max-w-[700px]"
          style={{ '--d': '0.08s' } as React.CSSProperties}
        >
          Every model is split across user-owned GPUs that together hold one full copy.
        </p>
      </Reveal>
      <div className="relative mt-14">
        <div
          ref={globeWrapRef}
          className="globe-enter relative mx-auto max-w-[1000px] h-[420px] md:h-[620px] overflow-hidden bg-fg/[0.02]"
        >
          <CfGlobe onReady={onGlobeReady} />
        </div>
        <Reveal className="relative max-w-[1200px] mx-auto -mt-10 md:-mt-16 border border-fg/10 bg-background grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-fg/10">
          <CornerMarks />
          {CELLS.map((c, i) => (
            <div key={c.t} className="rv p-6 md:p-8" style={{ '--d': `${i * 0.08}s` } as React.CSSProperties}>
              <h3 className="pixel-sans text-fg text-lg font-medium">{c.t}</h3>
              <p className="pixel-sans text-fg-60 text-base mt-2 leading-relaxed">{c.p}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

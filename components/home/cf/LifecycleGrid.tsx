'use client';

// The 8-step lifecycle as an open ledger: full-bleed 1480, dashed rules top
// and bottom, hairline verticals between cells — no outer box, no marks, and
// tighter type than the panels around it. A different width AND a different
// frame from both neighbours is what makes "dense" read as a deliberate
// register. Reveals as one moment, not eight staggered cells.
import { STEPS } from '../steps';
import Reveal from './Reveal';

export default function LifecycleGrid() {
  return (
    <section className="px-4 md:px-6">
      <Reveal className="max-w-[1080px] mx-auto text-center flex flex-col items-center gap-4">
        <h2 className="rv pixel-serif text-fg text-3xl md:text-[48px] md:leading-none">From announce to paid</h2>
        <p
          className="rv pixel-sans text-fg-60 text-sm md:text-[19px]"
          style={{ '--d': '0.08s' } as React.CSSProperties}
        >
          The life of a GPU on the network.
        </p>
        <p
          className="rv pixel-sans text-fg-40 text-xs md:text-sm"
          style={{ '--d': '0.14s' } as React.CSSProperties}
        >
          This is how the betanet works. Nodes join it at launch.
        </p>
      </Reveal>
      <Reveal className="max-w-[1480px] mx-auto mt-14">
        <div className="rv">
          <div className="dash-rule" aria-hidden />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="px-5 py-6 md:px-6 md:py-7 border-fg/10 border-b last:border-b-0 sm:[&:nth-child(2n+1)]:border-r sm:[&:nth-child(n+7)]:border-b-0 lg:border-r lg:[&:nth-child(4n)]:border-r-0 lg:[&:nth-child(n+5)]:border-b-0"
              >
                <div className="pixel-serif step-num text-fg-40 text-base">{s.n}</div>
                <h3 className="pixel-serif text-fg text-xl mt-1">{s.title}</h3>
                <p className="pixel-sans text-fg-60 text-[15px] mt-2 leading-snug">{s.line}</p>
              </div>
            ))}
          </div>
          <div className="dash-rule" aria-hidden />
        </div>
      </Reveal>
    </section>
  );
}

'use client';

// The 8-step lifecycle, out of the scroll story and into the reference's
// panel grammar: a centred title block, then a 4x2 hairline grid where
// adjacent cells share single 1px rules (no gaps).
import { STEPS } from '../steps';
import Reveal from './Reveal';
import CornerMarks from './CornerMarks';

export default function LifecycleGrid() {
  return (
    <section className="px-4 md:px-6 mt-4 md:mt-8">
      <Reveal className="max-w-[1080px] mx-auto text-center flex flex-col items-center gap-4">
        <h2 className="rv pixel-serif text-fg text-3xl md:text-5xl">From announce to paid</h2>
        <p
          className="rv pixel-sans text-fg-60 text-sm md:text-[19px]"
          style={{ '--d': '0.08s' } as React.CSSProperties}
        >
          The life of a GPU on the network.
        </p>
      </Reveal>
      <Reveal className="relative max-w-[1200px] mx-auto mt-8 md:mt-12 border border-fg/10 rounded-xl bg-background grid sm:grid-cols-2 lg:grid-cols-4">
        <CornerMarks />
        {STEPS.map((s, i) => (
          <div
            key={s.n}
            className="rv p-6 md:p-8 border-fg/10 border-b last:border-b-0 sm:[&:nth-child(n+7)]:border-b-0 lg:[&:nth-child(n+5)]:border-b-0 sm:[&:nth-child(2n+1)]:border-r lg:border-r lg:[&:nth-child(4n)]:border-r-0"
            style={{ '--d': `${i * 0.05}s` } as React.CSSProperties}
          >
            <div className="pixel-serif step-num text-fg-40 text-lg">{s.n}</div>
            <h3 className="pixel-serif text-fg text-xl md:text-2xl mt-1">{s.title}</h3>
            <p className="pixel-sans text-fg-60 text-sm mt-2 leading-relaxed">{s.line}</p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

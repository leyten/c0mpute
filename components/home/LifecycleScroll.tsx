'use client';

// The homepage stage: a 1000vh section pins a full-screen canvas; native
// scroll scrubs a prologue (the hero, beside a naked turning globe) into the
// 8-step lifecycle story and the one-network finale. One continuous globe,
// no wheel hijacking — the pin is position:sticky.
import { useEffect, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { STEPS } from './steps';
import { setLabelFont, clamp01 } from './scrollstage/art';
import { drawGlobeStory } from './scrollstage/globeScenes';
import LifecycleList from './LifecycleList';
import { useBrand } from '@/components/BrandProvider';

const CHAPTERS = 10; // hero prologue + 8 lifecycle steps + the finale

export default function LifecycleScroll({ hero }: { hero: React.ReactNode }) {
  const brand = useBrand();
  const wrapRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // canvas labels use the theme's Inter (next/font exposes it as a CSS var)
    const fam = getComputedStyle(canvas).getPropertyValue('--font-inter').trim();
    setLabelFont(fam ? `${fam}, monospace` : 'monospace');

    let W = 0, H = 0, raf = 0, cur = -1;
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    layout();
    let rz: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rz); rz = setTimeout(layout, 120); };
    window.addEventListener('resize', onResize);

    const draw = (t: number) => {
      const r = wrap.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      const p = clamp01(total > 0 ? -r.top / total : 0);
      const idx = Math.min(CHAPTERS - 1, Math.floor(p * CHAPTERS));
      if (idx !== cur) { cur = idx; setStep(idx); }
      // the hero copy rides the same scrub: fades and lifts as the story takes over
      const heroA = clamp01(1 - (p * CHAPTERS - 0.7) / 0.5);
      const h = heroRef.current;
      if (h) {
        h.style.opacity = heroA.toFixed(3);
        h.style.transform = `translateY(${((1 - heroA) * -40).toFixed(1)}px)`;
        h.style.pointerEvents = heroA > 0.5 ? 'auto' : 'none';
      }
      ctx.clearRect(0, 0, W, H);
      drawGlobeStory(ctx, W, H, p, t);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      clearTimeout(rz);
    };
  }, []);

  // Reduced motion: static hero + the plain editorial list.
  if (reduced) {
    return (
      <>
        <section className="relative bg-background min-h-screen flex items-center border-b border-fg/5">
          {hero}
        </section>
        <section id="network" className="bg-background py-16 md:py-24 border-t border-fg/5">
          <div className="max-w-6xl mx-auto px-4 md:px-6">
            <div className="text-center mb-10 md:mb-14">
              <div className="pixel-sans text-fg-40 text-xs tracking-widest mb-3 flex items-center justify-center gap-2">
                <span>THE NETWORK</span>
                <StatusBadge state="launching" />
              </div>
              <h2 className="pixel-serif text-fg text-3xl md:text-4xl lg:text-5xl">Torrent, but for compute</h2>
            </div>
            <LifecycleList />
          </div>
        </section>
      </>
    );
  }

  const finale = step >= CHAPTERS - 1;
  const railStep = Math.min(Math.max(step - 1, 0), 7);

  return (
    <section id="network" ref={wrapRef} className="relative bg-background" style={{ height: '1000vh' }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full z-10 pointer-events-none" />

        {/* readability gradient behind the mobile text block */}
        <div className="absolute inset-x-0 bottom-0 h-56 md:hidden pointer-events-none z-20"
          style={{
            background:
              'linear-gradient(to top, color-mix(in oklab, var(--background) 92%, transparent), transparent)',
          }} />

        {/* hero overlay — chapter zero; fades into the story on scroll */}
        <div ref={heroRef} className="absolute inset-0 z-0 max-md:z-20 flex items-center">
          {hero}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <span className="pixel-sans text-fg-60 text-xs tracking-widest uppercase">Scroll</span>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-fg-60">
              <path d="M8 2v12M3 9l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            </svg>
          </div>
        </div>

        {/* step text — left rail on desktop, bottom sheet on mobile */}
        {step >= 1 && !finale && (
          <div className="absolute z-20 left-5 right-5 bottom-10 md:right-auto md:left-[26%] md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:max-w-sm">
            <div key={step} className="fade-step">
              <div className="pixel-serif step-num text-fg-40 text-lg md:text-2xl">{STEPS[railStep].n}</div>
              <h3 className="pixel-serif text-fg text-3xl md:text-5xl mt-1 md:mt-2">{STEPS[railStep].title}</h3>
              <p className="pixel-sans text-fg-60 text-sm md:text-base mt-2 md:mt-4 leading-relaxed max-w-xs md:max-w-sm">
                {STEPS[railStep].line}
              </p>
            </div>
          </div>
        )}

        {/* finale — sits UNDER the canvas on a wide screen, where the globe is
            off to one side and uncovers it as it shrinks. On a phone the globe
            fills the screen, so the text has to sit above it or it is painted
            over entirely.

            It is mounted a chapter early so the globe can reveal it, which on a
            wide screen is invisible — it is behind the canvas. On a phone both
            blocks are lifted to z-20 and share the same bottom sheet, so the
            early mount printed "One network." straight over step 08. Hold it
            back there until the step text has left. */}
        {step >= CHAPTERS - 2 && (
          <div className={`absolute z-0 max-md:z-20 left-5 right-5 bottom-10 md:right-auto md:left-[26%] md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:max-w-sm${finale ? '' : ' max-md:hidden'}`}>
            <h3 className="pixel-serif text-fg text-3xl md:text-5xl">One network.</h3>
            <p className="pixel-sans text-fg-60 text-sm md:text-base mt-2 md:mt-4 leading-relaxed max-w-xs md:max-w-sm">
              Too big for one machine, so it runs on all of them.
            </p>
            <div className="mt-4 md:mt-6 flex flex-col gap-2">
              <a href={brand.urls.shard} target="_blank" rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
                Network map (testbed preview) →
              </a>
              <a href="https://github.com/leyten/shard" target="_blank" rel="noopener noreferrer"
                className="cursor-pointer pixel-sans text-steel-50 light:text-steel hover:text-steel text-sm transition-colors">
                Engine source →
              </a>
            </div>
          </div>
        )}

        {/* progress ticks */}
        {step >= 1 && (
          <div className="absolute z-20 right-5 md:right-10 top-1/2 -translate-y-1/2 flex flex-col gap-2.5">
            {STEPS.map((s, i) => (
              <span key={s.n}
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i <= railStep ? 'bg-fg' : 'bg-fg/20'}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

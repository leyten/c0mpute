'use client';

// The scroll-locked lifecycle experience: a 900vh section pins a full-screen
// canvas stage; native scroll scrubs an 8-step + finale animation (no wheel
// hijacking — the pin is position:sticky). Two scene scripts share the stage.
import { useEffect, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { STEPS } from './steps';
import { setLabelFont, clamp01 } from './scrollstage/art';
import { drawJourney } from './scrollstage/journeyScenes';
import { drawGlobeStory } from './scrollstage/globeScenes';
import LifecycleList from './LifecycleList';

const CHAPTERS = 9; // 8 lifecycle steps + the "one network" finale

export default function LifecycleScroll({ variant }: { variant: '1' | '2' }) {
  const wrapRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      ctx.clearRect(0, 0, W, H);
      (variant === '2' ? drawGlobeStory : drawJourney)(ctx, W, H, p, t);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      clearTimeout(rz);
    };
  }, [variant]);

  // Reduced motion: the plain editorial list instead of the pinned stage.
  if (reduced) {
    return (
      <section id="network" className="bg-black py-16 md:py-24 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-14">
            <div className="pixel-sans text-white/40 text-xs tracking-widest mb-3 flex items-center justify-center gap-2">
              <span>THE NETWORK</span>
              <StatusBadge state="launching" />
            </div>
            <h2 className="pixel-serif text-white text-3xl md:text-4xl lg:text-5xl">Torrent, but for compute</h2>
          </div>
          <LifecycleList />
        </div>
      </section>
    );
  }

  const finale = step >= 8;

  return (
    <section id="network" ref={wrapRef} className="relative bg-black border-t border-white/5" style={{ height: '900vh' }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

        {/* readability gradient behind the mobile text block */}
        <div className="absolute inset-x-0 bottom-0 h-56 md:hidden pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(12,10,9,0.92), rgba(12,10,9,0))' }} />

        {/* step text — left rail on desktop, bottom sheet on mobile */}
        <div className="absolute left-5 right-5 bottom-10 md:right-auto md:left-[26%] md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:max-w-sm">
          {!finale ? (
            <div key={step} className="fade-step">
              <div className="pixel-serif step-num text-white/40 text-lg md:text-2xl">{STEPS[step].n}</div>
              <h3 className="pixel-serif text-white text-3xl md:text-5xl mt-1 md:mt-2">{STEPS[step].title}</h3>
              <p className="pixel-sans text-white/60 text-sm md:text-base mt-2 md:mt-4 leading-relaxed max-w-xs md:max-w-sm">
                {STEPS[step].line}
              </p>
            </div>
          ) : (
            <div key="finale" className="fade-step">
              <h3 className="pixel-serif text-white text-3xl md:text-5xl">One network.</h3>
              <p className="pixel-sans text-white/60 text-sm md:text-base mt-2 md:mt-4 leading-relaxed max-w-xs md:max-w-sm">
                Too big for one machine, so it runs on all of them.
              </p>
              <div className="mt-4 md:mt-6 flex flex-col gap-2">
                <a href="https://shard.c0mpute.ai" target="_blank" rel="noopener noreferrer"
                  className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">
                  Network map (testbed preview) →
                </a>
                <a href="https://github.com/leyten/shard" target="_blank" rel="noopener noreferrer"
                  className="cursor-pointer pixel-sans text-[#80a0c1]/50 hover:text-[#80a0c1] text-sm transition-colors">
                  Engine source →
                </a>
              </div>
            </div>
          )}
        </div>

        {/* progress ticks */}
        <div className="absolute right-5 md:right-10 top-1/2 -translate-y-1/2 flex flex-col gap-2.5">
          {STEPS.map((s, i) => (
            <span key={s.n}
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${i <= Math.min(step, 7) ? 'bg-white' : 'bg-white/20'}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

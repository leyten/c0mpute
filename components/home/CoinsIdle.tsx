'use client';

// "Plug in, get paid" panel art: coins landing on stacks. The graphics card
// that used to sit beside them was removed — the panel is about the money.
import { useEffect, useRef } from 'react';
import { w, coinStack } from './scrollstage/art';

// The graphics card used to occupy the left of this panel and the stacks were
// pushed right to clear it. With the card gone they carry the panel alone.
//
// No x here on purpose. They used to sit at fixed fractions of the width, which
// says nothing about how wide they actually are: at panel size the three came
// out 112, 130 and 108px across with their centres only 75px apart, so they
// interpenetrated. Positions are solved from the radii below instead, which
// puts them edge to edge whatever the panel or the scale does.
const STACKS = [
  { base: 2, s: 1.25 },
  { base: 4, s: 1.45 },
  { base: 3, s: 1.2 },
];
// coinStack draws a coin 28*s wide either side of its centre.
const RX = 28;
const T = 2600; // one coin drop per cycle, ms

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));


export default function CoinsIdle() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, raf = 0;
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    layout();

    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      const kRaw = Math.min(1.7, H / 150);
      // Lay them out touching, then shrink the whole group if that would run
      // past the panel — better three smaller coins side by side than three
      // big ones sitting on top of each other.
      const span = (kk: number) => STACKS.reduce((a, st) => a + 2 * RX * st.s * kk, 0);
      const k = kRaw * Math.min(1, (W * 0.88) / Math.max(1, span(kRaw)));
      const xs: number[] = [];
      let edge = (W - span(k)) / 2;
      for (const st of STACKS) {
        const r = RX * st.s * k;
        xs.push(edge + r);
        edge += 2 * r;
      }
      const yBase = H * 0.74;
      const target = Math.floor(t / T) % STACKS.length;
      const tc = still ? 0 : t % T;

      // the stacks
      STACKS.forEach((st, i) => {
        coinStack(ctx, xs[i], yBase, st.base, st.s * k, 1);
        if (!still && i === target && tc >= 0.5 * T && tc <= 0.7 * T) {
          const f = 1 - seg(tc, 0.5 * T, 0.7 * T);
          const rx = 28 * st.s * k, ry = 9 * st.s * k;
          const yTop = yBase - (st.base - 1) * 10 * st.s * k - 8 * st.s * k;
          ctx.strokeStyle = w(0.9 * f);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(xs[i], yTop, rx + 3, ry + 2, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      });

      // a coin falls onto this cycle's stack
      if (!still) {
        const st = STACKS[target];
        const yTop = yBase - (st.base - 1) * 10 * st.s * k - 8 * st.s * k;
        const fall = seg(tc, 0.18 * T, 0.5 * T);
        if (fall > 0 && fall < 1) {
          const y = yTop - H * 0.3 + H * 0.3 * fall * fall;
          coinStack(ctx, xs[target], y, 1, st.s * k, 0.95);
        }
      }

      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    let rz: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); if (still) draw(0); }, 120); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      clearTimeout(rz);
    };
  }, []);

  return <canvas ref={ref} className="w-full h-full" />;
}

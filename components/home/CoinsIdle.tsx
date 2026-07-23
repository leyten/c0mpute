'use client';

// "Plug in, get paid" panel art, concrete: your box (the pixel monitor)
// serving on the left; every cycle a work-pulse leaves it and a coin falls
// onto one of the stacks. Cause and effect: the box works, coins land.
import { useEffect, useRef } from 'react';
import { w, green, pcIcon, coinStack } from './scrollstage/art';

const STACKS = [
  { x: 0.55, base: 2, s: 1.0 },
  { x: 0.72, base: 4, s: 1.15 },
  { x: 0.89, base: 3, s: 0.95 },
];
const T = 2400; // one work → coin cycle, ms

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const easeIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

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
      const k = Math.min(1.35, H / 185); // coin scale for the panel
      const yBase = H * 0.8;
      const cycle = Math.floor(t / T);
      const target = cycle % STACKS.length;
      const tc = still ? 0 : t % T;

      // ---- the box, serving ----
      const mx = W * 0.2, myc = H * 0.46;
      const iconS = Math.min(W, H) / 42;
      pcIcon(ctx, mx, myc, iconS, 0.95);
      // serving square, map language
      const blink = still ? 1 : 0.55 + 0.45 * Math.sin(t * 0.004);
      ctx.fillStyle = green(0.25 * blink);
      ctx.fillRect(Math.round(mx) - 5, Math.round(myc + 13 * iconS) - 5, 10, 10);
      ctx.fillStyle = green(blink);
      ctx.fillRect(Math.round(mx) - 2, Math.round(myc + 13 * iconS) - 2, 5, 5);

      // ---- the stacks ----
      STACKS.forEach((st, i) => {
        const landing = !still && i === target && tc >= 0.62 * T && tc <= 0.82 * T;
        coinStack(ctx, st.x * W, yBase, st.base, st.s * k, 1);
        if (landing) {
          // landing flash on the crown coin
          const f = 1 - seg(tc, 0.62 * T, 0.82 * T);
          const rx = 28 * st.s * k, ry = 9 * st.s * k;
          const yTop = yBase - (st.base - 1) * 10 * st.s * k - 8 * st.s * k;
          ctx.strokeStyle = w(0.9 * f);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(st.x * W, yTop, rx + 3, ry + 2, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      });

      if (!still) {
        const st = STACKS[target];
        const sx0 = mx + 13 * iconS, sy0 = myc;
        const tx = st.x * W;
        const yTop = yBase - (st.base - 1) * 10 * st.s * k - 8 * st.s * k;
        // work-pulse: box → the stack's base
        const wp = seg(tc, 0.04 * T, 0.34 * T);
        if (wp > 0 && wp < 1) {
          const f = easeIO(wp);
          const cxq = (sx0 + tx) / 2, cyq = Math.min(sy0, yTop) - H * 0.18;
          const u = 1 - f;
          const qx = u * u * sx0 + 2 * u * f * cxq + f * f * tx;
          const qy = u * u * sy0 + 2 * u * f * cyq + f * f * (yTop - H * 0.24);
          ctx.fillStyle = green(0.9);
          ctx.fillRect((qx | 0) - 1, (qy | 0) - 1, 3, 3);
        }
        // the coin falls
        const fall = seg(tc, 0.36 * T, 0.62 * T);
        if (fall > 0 && fall < 1) {
          const y = yTop - H * 0.24 + (H * 0.24) * fall * fall;
          coinStack(ctx, tx, y, 1, st.s * k, 0.95);
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

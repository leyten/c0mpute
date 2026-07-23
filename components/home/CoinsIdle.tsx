'use client';

// "Plug in, get paid" panel art: a field of USDC coin stacks breathing up and
// down — coins accrue and settle in slow, staggered waves. Fills the panel
// instead of leaving dead space. Time-driven idle animation.
import { useEffect, useRef } from 'react';
import { coinStack } from './scrollstage/art';

const STACKS = [
  { x: 0.09, s: 0.72, base: 2.2, amp: 1.6, sp: 0.00042, ph: 0.5, y: 0.84 },
  { x: 0.25, s: 0.95, base: 3.4, amp: 2.0, sp: 0.00031, ph: 2.1, y: 0.9 },
  { x: 0.42, s: 0.78, base: 2.6, amp: 1.4, sp: 0.00052, ph: 4.0, y: 0.82 },
  { x: 0.59, s: 1.05, base: 4.0, amp: 2.2, sp: 0.00027, ph: 1.2, y: 0.9 },
  { x: 0.77, s: 0.85, base: 3.0, amp: 1.8, sp: 0.00046, ph: 3.3, y: 0.85 },
  { x: 0.92, s: 0.68, base: 2.0, amp: 1.3, sp: 0.00058, ph: 5.2, y: 0.9 },
];

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
      const k = Math.min(1.6, H / 155); // scale coins to fill the panel
      for (const st of STACKS) {
        const count = st.base + st.amp * (0.5 + 0.5 * Math.sin((still ? 0 : t) * st.sp + st.ph));
        coinStack(ctx, st.x * W, st.y * H, count, st.s * k, 1);
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

'use client';

// The hero card's only motion, measured off the reference's hero video: a dot
// matrix on a ~5x9px grid whose brightness carries a single downward
// travelling band — wavelength ~285px, speed ~71px/s (4s period), crest about
// a third of the wavelength. Brightness depends on y only, so each frame is
// ~95 drawImage calls of one precomputed dot-row strip at varying alpha, not
// 27k rects.
import { useEffect, useRef } from 'react';

const PX = 5, PY = 9, LAM = 285, V = 71;

export default function DotWave() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let W = 0, H = 0, raf = 0;
    let strip: HTMLCanvasElement | null = null;
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      strip = document.createElement('canvas');
      strip.width = Math.max(1, Math.round(W * dpr));
      strip.height = Math.round(PY * dpr);
      const g = strip.getContext('2d')!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = 'rgb(255, 205, 140)'; // the warm dot hue over ink
      for (let x = PX / 2; x < W; x += PX) g.fillRect(Math.round(x) - 1, Math.round(PY / 2) - 1, 2, 2);
    };
    layout();

    const draw = (t: number) => {
      if (!strip) return;
      ctx.clearRect(0, 0, W, H);
      for (let y = 0; y < H; y += PY) {
        let ph = ((y - t * 0.001 * V) / LAM) % 1;
        if (ph < 0) ph += 1;
        const c = Math.cos(2 * Math.PI * ph);
        const band = c > 0 ? Math.pow(c, 6) : 0; // narrow crest, ~1/3 duty
        ctx.globalAlpha = 0.10 + 0.38 * band;
        ctx.drawImage(strip, 0, 0, strip.width, strip.height, 0, y, W, PY);
      }
      ctx.globalAlpha = 1;
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

  return <canvas ref={ref} className="absolute inset-0 w-full h-full" aria-hidden />;
}

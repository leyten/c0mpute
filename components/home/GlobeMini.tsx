'use client';

// Small ambient land-dot globe with one serving ring — the doors-panel art
// for the open-model community door. Time-driven, no scroll dependency.
import { useEffect, useRef } from 'react';
import { drawGlobe, drawArc, buildArc, project, sph, green, GlobeView, V3 } from './scrollstage/art';

const CITIES: [number, number][] = [
  [4.35, 50.85], [8.7, 50.1], [14.4, 50.1], [2.35, 48.85], [4.9, 52.37], [-0.13, 51.5],
];

export default function GlobeMini() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const vs = CITIES.map(([lon, lat]) => sph(lon, lat) as V3);
    const arcs = vs.map((a, i) => buildArc(a, vs[(i + 1) % vs.length], 26, 0.05));
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
      const gv: GlobeView = {
        cx: W / 2, cy: H / 2, R: Math.min(W, H) * 0.42,
        yaw: -0.3 + (still ? 0 : t * 0.00004), tilt: 0.35, alpha: 1,
      };
      drawGlobe(ctx, gv);
      arcs.forEach((a, ai) => drawArc(ctx, a, gv, green(0.5), 1, still ? -1 : (t * 0.00022 + ai * 0.37) % 1));
      vs.forEach((v) => {
        const pr = project(v, gv);
        if (pr) {
          ctx.fillStyle = green(0.2);
          ctx.fillRect((pr.x | 0) - 4, (pr.y | 0) - 4, 8, 8);
          ctx.fillStyle = green(Math.min(1, pr.z + 0.2));
          ctx.fillRect((pr.x | 0) - 2, (pr.y | 0) - 2, 4, 4);
        }
      });
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

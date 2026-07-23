'use client';

// "Build on the network" panel art, concrete: an app window (the pixel
// browser style) wired to the real Europe map with the story's green ring.
// A request dot drops from the window into the ring, the ring serves, and
// the answer streams back up while response lines fill in the window.
import { useEffect, useRef } from 'react';
import { BG, w, green } from './scrollstage/art';
import { land } from './scrollstage/land';

const LON0 = -12, LON1 = 25, LAT0 = 38, LAT1 = 60;
// ring order: brussels → amsterdam → frankfurt → prague → paris → london
const RING: [number, number][] = [
  [4.35, 50.85], [4.9, 52.37], [8.7, 50.1], [14.4, 50.1], [2.35, 48.85], [-0.13, 51.5],
];
const T = 6400; // request → serve → answer loop, ms

let euDots: [number, number][] | null = null;
function eu(): [number, number][] {
  if (!euDots) {
    const L = land();
    euDots = [];
    for (let i = 0; i < L.length; i += 3) {
      const lat = (Math.asin(L[i + 1]) * 180) / Math.PI;
      const lon = (Math.atan2(L[i], L[i + 2]) * 180) / Math.PI;
      if (lon >= LON0 && lon <= LON1 && lat >= LAT0 && lat <= LAT1) euDots.push([lon, lat]);
    }
  }
  return euDots;
}

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const easeIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

export default function BuildIdle() {
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
      const tc = still ? T * 0.55 : t % T;

      // ---- the map, right: real Europe dots + the serving ring ----
      const mx = W * 0.46, mw = W * 0.5, my = H * 0.08, mh = H * 0.84;
      const P = (lon: number, lat: number): [number, number] => [
        mx + ((lon - LON0) / (LON1 - LON0)) * mw,
        my + ((LAT1 - lat) / (LAT1 - LAT0)) * mh,
      ];
      for (const [lon, lat] of eu()) {
        const [dx, dy] = P(lon, lat);
        const hsh = Math.abs(Math.sin(lon * 12.9 + lat * 7.7));
        ctx.fillStyle = w(0.3 + 0.25 * hsh);
        ctx.fillRect(Math.round(dx), Math.round(dy), 2, 2);
      }
      const ringPts = RING.map(([lon, lat]) => P(lon, lat));
      const serving = tc > 0.2 * T && tc < 0.8 * T;
      ctx.strokeStyle = green(serving ? 0.85 : 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ringPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ringPts.forEach(([x, y]) => {
        ctx.fillStyle = green(0.25);
        ctx.fillRect((x | 0) - 4, (y | 0) - 4, 8, 8);
        ctx.fillStyle = green(serving ? 1 : 0.7);
        ctx.fillRect((x | 0) - 2, (y | 0) - 2, 4, 4);
      });
      // token pulse loops the ring while serving
      if (serving && !still) {
        const pos = (seg(tc, 0.2 * T, 0.8 * T) * 3) % 1 * 6;
        const i = Math.floor(pos) % 6;
        const [x0, y0] = ringPts[i];
        const [x1, y1] = ringPts[(i + 1) % 6];
        const f = pos - Math.floor(pos);
        ctx.fillStyle = '#fff';
        ctx.fillRect(Math.round(x0 + (x1 - x0) * f) - 1, Math.round(y0 + (y1 - y0) * f) - 1, 3, 3);
      }

      // ---- the app window, left ----
      const wx = W * 0.045, wy = H * 0.1, wwd = W * 0.36, wht = H * 0.68;
      ctx.beginPath();
      ctx.roundRect(wx + 0.5, wy + 0.5, wwd, wht, 8);
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = w(0.4);
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = w(0.45);
        ctx.fillRect(wx + 10 + i * 10, wy + 9, 4, 4);
      }
      ctx.strokeStyle = w(0.15);
      ctx.beginPath();
      ctx.moveTo(wx, wy + 20);
      ctx.lineTo(wx + wwd, wy + 20);
      ctx.stroke();
      // the prompt: two bars, user-side
      ctx.fillStyle = w(0.55);
      ctx.fillRect(wx + 12, wy + 32, wwd * 0.62, 6);
      ctx.fillRect(wx + 12, wy + 44, wwd * 0.4, 6);
      // the answer: bars that fill while the ring serves
      const a1 = seg(tc, 0.3 * T, 0.48 * T), a2 = seg(tc, 0.48 * T, 0.66 * T), a3 = seg(tc, 0.66 * T, 0.8 * T);
      ctx.fillStyle = w(0.85);
      if (a1 > 0) ctx.fillRect(wx + 12, wy + wht - 46, wwd * 0.7 * a1, 6);
      if (a2 > 0) ctx.fillRect(wx + 12, wy + wht - 34, wwd * 0.78 * a2, 6);
      if (a3 > 0) ctx.fillRect(wx + 12, wy + wht - 22, wwd * 0.5 * a3, 6);
      // block cursor at the growing edge
      if (tc > 0.3 * T && (Math.floor(t / 450) % 2 === 0 || tc < 0.8 * T)) {
        const edge = a3 > 0 ? [wwd * 0.5 * a3, wht - 22] : a2 > 0 ? [wwd * 0.78 * a2, wht - 34] : [wwd * 0.7 * a1, wht - 46];
        ctx.fillStyle = w(0.85);
        ctx.fillRect(wx + 14 + edge[0], wy + edge[1] - 1, 5, 8);
      }

      // ---- the wire: window → brussels, request down, answer back ----
      const [bx, by] = ringPts[0];
      const sx = wx + wwd, sy = wy + wht * 0.55;
      ctx.strokeStyle = w(0.2);
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + bx) / 2, Math.max(sy, by) + H * 0.12, bx, by);
      ctx.stroke();
      ctx.setLineDash([]);
      const qp = (f: number): [number, number] => {
        const cxq = (sx + bx) / 2, cyq = Math.max(sy, by) + H * 0.12;
        const u = 1 - f;
        return [u * u * sx + 2 * u * f * cxq + f * f * bx, u * u * sy + 2 * u * f * cyq + f * f * by];
      };
      if (!still) {
        const req = seg(tc, 0.02 * T, 0.2 * T);
        if (req > 0 && req < 1) {
          const [qx, qy] = qp(easeIO(req));
          ctx.fillStyle = '#fff';
          ctx.fillRect((qx | 0) - 1, (qy | 0) - 1, 3, 3);
        }
        if (serving) {
          for (let k = 0; k < 3; k++) {
            const f = (seg(tc, 0.24 * T, 0.8 * T) * 2.4 + k / 3) % 1;
            const [qx, qy] = qp(1 - f);
            ctx.fillStyle = green(0.9 * Math.sin(Math.PI * f));
            ctx.fillRect((qx | 0) - 1, (qy | 0) - 1, 3, 3);
          }
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

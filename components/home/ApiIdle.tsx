'use client';

// "Build on the network" panel art: a terminal types an API call and the
// answer streams back token by token while a tiny serving ring spins — the
// developer door, shown instead of told. Time-driven idle loop.
import { useEffect, useRef } from 'react';
import { BG, w, green } from './scrollstage/art';

const REQ_1 = '$ curl c0mpute.ai/v1/chat \\';
const REQ_2 = "    -d '{ \"model\": \"swarm\", \"stream\": true }'";
const RES = 'Hello from six GPUs in six cities.';
const T = 9500; // loop length, ms

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

export default function ApiIdle() {
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
      const tc = still ? T - 1500 : t % T;

      // window chrome
      const x0 = Math.round(W * 0.04), y0 = Math.round(H * 0.06);
      const ww = Math.round(W * 0.92), wh = Math.round(H * 0.88);
      ctx.beginPath();
      ctx.roundRect(x0 + 0.5, y0 + 0.5, ww, wh, 10);
      ctx.fillStyle = BG;
      ctx.fill();
      ctx.strokeStyle = w(0.15);
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = w(0.35);
        ctx.fillRect(x0 + 12 + i * 12, y0 + 12, 5, 5);
      }
      ctx.strokeStyle = w(0.1);
      ctx.beginPath();
      ctx.moveTo(x0, y0 + 26);
      ctx.lineTo(x0 + ww, y0 + 26);
      ctx.stroke();

      const mono = '11px ui-monospace, Menlo, Consolas, monospace';
      ctx.font = mono;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tx = x0 + 14;
      const lineH = 19;
      let ty = y0 + 26 + 18;

      // request types out
      const r1 = REQ_1.slice(0, Math.floor(seg(tc, 300, 1900) * REQ_1.length));
      const r2 = REQ_2.slice(0, Math.floor(seg(tc, 1900, 3400) * REQ_2.length));
      ctx.fillStyle = w(0.85);
      ctx.fillText(r1, tx, ty);
      ty += lineH;
      ctx.fillText(r2, tx, ty);
      ty += lineH * 1.5;

      // response streams back
      const streaming = tc >= 3900;
      if (streaming) {
        const chars = Math.floor(seg(tc, 3900, 7200) * RES.length);
        ctx.fillStyle = green(0.9);
        ctx.fillText('→', tx, ty);
        ctx.fillStyle = w(0.7);
        ctx.fillText(RES.slice(0, chars), tx + 18, ty);
        // block cursor
        if (Math.floor(tc / 450) % 2 === 0 || chars < RES.length) {
          const cw = ctx.measureText(RES.slice(0, chars)).width;
          ctx.fillStyle = w(0.7);
          ctx.fillRect(tx + 20 + cw, ty - 6, 6, 12);
        }
      } else if (tc > 3400) {
        ctx.fillStyle = w(0.4);
        ctx.fillText('· · ·', tx, ty);
      }

      // tiny serving ring, top right of the window
      const rc = { x: x0 + ww - 26, y: y0 + 13 };
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        ctx.fillStyle = green(0.45);
        ctx.fillRect(Math.round(rc.x + Math.cos(a) * 8) - 1, Math.round(rc.y + Math.sin(a) * 8) - 1, 3, 3);
      }
      if (!still) {
        const a = t * 0.004;
        ctx.fillStyle = green(1);
        ctx.fillRect(Math.round(rc.x + Math.cos(a) * 8) - 1, Math.round(rc.y + Math.sin(a) * 8) - 1, 3, 3);
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

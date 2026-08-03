'use client';

// "Plug in, get paid" panel art, concrete: a detailed pixel graphics card —
// shroud, two fans with spinning blades, PCIe fingers, bracket, a breathing
// green LED (serving) — and coins dropping onto the stacks beside it.
// The card runs, the money lands.
import { useEffect, useRef } from 'react';
import { BG, w, green, coinStack } from './scrollstage/art';

const STACKS = [
  { x: 0.62, base: 2, s: 0.95 },
  { x: 0.775, base: 4, s: 1.1 },
  { x: 0.92, base: 3, s: 0.9 },
];
const T = 2600; // one coin drop per cycle, ms

const seg = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)));

function gpu(ctx: CanvasRenderingContext2D, cx: number, cy: number, gw: number, t: number, still: boolean) {
  const gh = gw * 0.40;
  const x0 = cx - gw / 2, y0 = cy - gh / 2;
  ctx.lineWidth = 1;

  // io bracket, left
  ctx.beginPath();
  ctx.roundRect(x0 - gw * 0.045, y0 + gh * 0.06, gw * 0.045, gh * 0.88, 2);
  ctx.fillStyle = BG; ctx.fill();
  ctx.fillStyle = w(0.05); ctx.fill();
  ctx.strokeStyle = w(0.7); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = w(0.4);
    ctx.fillRect(Math.round(x0 - gw * 0.032), Math.round(y0 + gh * (0.16 + i * 0.24)), Math.max(2, gw * 0.018), Math.round(gh * 0.14));
  }

  // shroud
  ctx.beginPath();
  ctx.roundRect(x0 + 0.5, y0 + 0.5, gw, gh, 8);
  ctx.fillStyle = BG; ctx.fill();
  ctx.fillStyle = w(0.06); ctx.fill();
  ctx.strokeStyle = w(0.85); ctx.stroke();

  // pcb lip + pcie fingers under the card
  const pcbY = y0 + gh;
  ctx.strokeStyle = w(0.6);
  ctx.beginPath();
  ctx.moveTo(x0 + gw * 0.04, pcbY + 3);
  ctx.lineTo(x0 + gw, pcbY + 3);
  ctx.stroke();
  ctx.fillStyle = w(0.55);
  const fx0 = x0 + gw * 0.14, fx1 = x0 + gw * 0.62;
  for (let x = fx0; x < fx1; x += 7) ctx.fillRect(Math.round(x), Math.round(pcbY + 4), 4, Math.max(3, gh * 0.07));

  // power connector, top right
  ctx.strokeStyle = w(0.6);
  ctx.beginPath();
  ctx.roundRect(x0 + gw * 0.8, y0 - gh * 0.09, gw * 0.13, gh * 0.09, 2);
  ctx.stroke();

  // green led strip along the top edge, breathing = serving
  const led = still ? 0.8 : 0.5 + 0.5 * Math.sin(t * 0.0025);
  ctx.fillStyle = green(0.25 + 0.6 * led);
  ctx.fillRect(Math.round(x0 + gw * 0.1), Math.round(y0 + 3), Math.round(gw * 0.55), 2);

  // two fans with spinning blades
  const fr = gh * 0.36;
  [x0 + gw * 0.28, x0 + gw * 0.72].forEach((fcx, fi) => {
    const fcy = cy;
    // recessed ring
    ctx.strokeStyle = w(0.75);
    ctx.beginPath();
    ctx.arc(fcx, fcy, fr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = w(0.25);
    ctx.beginPath();
    ctx.arc(fcx, fcy, fr + 3, 0, Math.PI * 2);
    ctx.stroke();
    // blades
    const off = (still ? 0 : t * 0.004) * (fi === 0 ? 1 : -1) + fi * 0.5;
    ctx.strokeStyle = w(0.65);
    ctx.lineWidth = Math.max(1.5, fr * 0.09);
    for (let k = 0; k < 6; k++) {
      const a = off + (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(fcx + Math.cos(a) * fr * 0.22, fcy + Math.sin(a) * fr * 0.22);
      ctx.quadraticCurveTo(
        fcx + Math.cos(a + 0.45) * fr * 0.6, fcy + Math.sin(a + 0.45) * fr * 0.6,
        fcx + Math.cos(a + 0.8) * fr * 0.9, fcy + Math.sin(a + 0.8) * fr * 0.9,
      );
      ctx.stroke();
    }
    ctx.lineWidth = 1;
    // hub
    ctx.beginPath();
    ctx.arc(fcx, fcy, fr * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = BG; ctx.fill();
    ctx.fillStyle = w(0.1); ctx.fill();
    ctx.strokeStyle = w(0.7); ctx.stroke();
  });

  // vents between the fans
  ctx.fillStyle = w(0.3);
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(Math.round(cx - 2 + (i - 1) * 6), Math.round(cy - gh * 0.18), 2, Math.round(gh * 0.36));
  }
}

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
      const k = Math.min(1.25, H / 195);
      const yBase = H * 0.78;
      const target = Math.floor(t / T) % STACKS.length;
      const tc = still ? 0 : t % T;

      // the card, working
      gpu(ctx, W * 0.27, H * 0.46, Math.min(W * 0.4, H * 1.35), t, still);

      // the stacks
      STACKS.forEach((st, i) => {
        coinStack(ctx, st.x * W, yBase, st.base, st.s * k, 1);
        if (!still && i === target && tc >= 0.5 * T && tc <= 0.7 * T) {
          const f = 1 - seg(tc, 0.5 * T, 0.7 * T);
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

      // a coin falls onto this cycle's stack
      if (!still) {
        const st = STACKS[target];
        const yTop = yBase - (st.base - 1) * 10 * st.s * k - 8 * st.s * k;
        const fall = seg(tc, 0.18 * T, 0.5 * T);
        if (fall > 0 && fall < 1) {
          const y = yTop - H * 0.3 + H * 0.3 * fall * fall;
          coinStack(ctx, st.x * W, y, 1, st.s * k, 0.95);
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

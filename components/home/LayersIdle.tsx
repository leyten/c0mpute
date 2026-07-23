'use client';

// "Build on the network" panel art: an isometric stack — the network is the
// ground slab (dotted like the map, green serving nodes, a roaming pulse),
// a protocol slab sits on it, and app blocks hover on top with request dots
// rising into them. The Hyperliquid layers idea, in the raw dot style.
import { useEffect, useRef } from 'react';
import { BG, w, green } from './scrollstage/art';

const BLOCKS: { u: number; v: number; ph: number }[] = [
  { u: -0.3, v: 0.16, ph: 0.4 },
  { u: 0.2, v: -0.22, ph: 2.5 },
  { u: 0.38, v: 0.34, ph: 4.6 },
];

export default function LayersIdle() {
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
      const cx = W / 2;
      const gx = W * 0.185, gy = H * 0.095;

      // one iso slab: top rhombus + the two visible side faces
      const slab = (scx: number, yTop: number, hu: number, hv: number, th: number, edgeA: number) => {
        const P = (u: number, v: number): [number, number] => [scx + (u - v) * gx, yTop + (u + v) * gy];
        const [txx, tyy] = P(-hu, -hv);
        const [rxx, ryy] = P(hu, -hv);
        const [bxx, byy] = P(hu, hv);
        const [lxx, lyy] = P(-hu, hv);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rxx, ryy); ctx.lineTo(rxx, ryy + th); ctx.lineTo(bxx, byy + th); ctx.lineTo(bxx, byy); ctx.closePath();
        ctx.fillStyle = BG; ctx.fill();
        ctx.strokeStyle = w(edgeA * 0.6); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(lxx, lyy); ctx.lineTo(lxx, lyy + th); ctx.lineTo(bxx, byy + th); ctx.lineTo(bxx, byy); ctx.closePath();
        ctx.fillStyle = BG; ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(txx, tyy); ctx.lineTo(rxx, ryy); ctx.lineTo(bxx, byy); ctx.lineTo(lxx, lyy); ctx.closePath();
        ctx.fillStyle = BG; ctx.fill();
        ctx.strokeStyle = w(edgeA); ctx.stroke();
        return P;
      };

      // ---- the ground layer: the network ----
      const baseTop = H * 0.55;
      const PB = slab(cx, baseTop, 1, 1, Math.max(10, H * 0.06), 0.55);
      // dotted fabric on the top face
      for (let u = -0.9; u <= 0.9; u += 0.115) {
        for (let v = -0.9; v <= 0.9; v += 0.115) {
          const [dx, dy] = PB(u, v);
          const hsh = Math.abs(Math.sin(u * 12.9 + v * 7.7));
          ctx.fillStyle = w(0.16 + 0.16 * hsh);
          ctx.fillRect(Math.round(dx), Math.round(dy), 2, 2);
        }
      }
      // serving nodes on the fabric
      const NODES: [number, number][] = [[-0.42, 0.22], [0.34, -0.3], [0.06, 0.6], [-0.15, -0.55]];
      NODES.forEach(([u, v]) => {
        const [nx, ny] = PB(u, v);
        ctx.fillStyle = green(0.18);
        ctx.fillRect((nx | 0) - 4, (ny | 0) - 4, 8, 8);
        ctx.fillStyle = green(0.85);
        ctx.fillRect((nx | 0) - 2, (ny | 0) - 2, 4, 4);
      });
      // a pulse roaming the fabric
      if (!still) {
        const pu = (((t * 0.00021) % 1) * 1.7) - 0.85;
        const pv = 0.55 * Math.sin(t * 0.0005);
        const [px_, py_] = PB(pu, pv);
        ctx.fillStyle = '#fff';
        ctx.fillRect((px_ | 0) - 1, (py_ | 0) - 1, 3, 3);
      }

      // ---- the protocol slab on top of it ----
      const midTh = Math.max(8, H * 0.05);
      const midTop = baseTop - midTh - 2;
      const PM = slab(cx, midTop, 0.58, 0.58, midTh, 0.75);

      // ---- app blocks, hovering above ----
      BLOCKS.forEach((b, k) => {
        const hover = still ? 0 : Math.sin(t * 0.0009 + b.ph) * 2.5;
        const [mx, my] = PM(b.u, b.v);
        const bh = Math.max(7, H * 0.045);
        const yTop = my - bh - 4 - hover;
        // request dots rising from the fabric into the block
        if (!still) {
          for (let d = 0; d < 2; d++) {
            const phase = (t * 0.00035 + k / 3 + d * 0.5) % 1;
            const [bx0, by0] = PB(b.u * 0.9, b.v * 0.9);
            const yy = by0 + (yTop + bh - by0) * phase;
            ctx.fillStyle = w(0.75 * Math.sin(Math.PI * phase));
            ctx.fillRect((bx0 | 0) - 1, (yy | 0), 2, 2);
          }
        }
        slab(cx + (b.u - b.v) * gx, yTop - (b.u + b.v) * gy * 0 + (b.u + b.v) * gy, 0.15, 0.15, bh, 0.9);
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

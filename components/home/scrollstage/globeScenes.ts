// Variant 2 — "The network view": the whole story happens ON the real
// land-dot globe (the shard map aesthetic). A Brussels box announces, gets
// measured, pulls its slice from peers, forms an EU ring, serves, settles,
// gets paid — then the camera pulls back and more rings light the map.
import {
  clamp01, seg, easeIO, easeOut, lerp, w, green,
  ripple, coinStack, receipt, meter, label, cardBox,
  drawGlobe, drawArc, buildArc, project, rotv, sph, GlobeView, V3,
} from './art';

const CH = 1 / 9;
const ch = (i: number, p: number) => seg(p, i * CH, (i + 1) * CH);

// A 6-city EU ring, Brussels as the protagonist.
const RING: { name: string; lon: number; lat: number }[] = [
  { name: 'brussels', lon: 4.35, lat: 50.85 },
  { name: 'amsterdam', lon: 4.9, lat: 52.37 },
  { name: 'frankfurt', lon: 8.7, lat: 50.1 },
  { name: 'prague', lon: 14.4, lat: 50.1 },
  { name: 'paris', lon: 2.35, lat: 48.85 },
  { name: 'london', lon: -0.13, lat: 51.5 },
];
const SEEDERS = [2, 4]; // frankfurt, paris

const WORLD_RINGS: [number, number][][] = [
  [[-74.0, 40.7], [-87.6, 41.9], [-79.4, 43.7], [-71.06, 42.36]],
  [[103.8, 1.35], [139.7, 35.7], [126.98, 37.57], [121.47, 31.23]],
  [[-46.6, -23.5], [-58.4, -34.6], [-70.66, -33.45]],
];

let ringVs: V3[] | null = null;
let centroid: V3 | null = null;
let ringArcs: Float32Array[] | null = null;
let seedArcs: Float32Array[] | null = null;
let worldArcs: Float32Array[][] | null = null;
const _cv: V3 = [0, 0, 0];
function prep() {
  if (!ringVs) {
    ringVs = RING.map((c) => sph(c.lon, c.lat) as V3);
    const m: V3 = [0, 0, 0];
    ringVs.forEach((v) => { m[0] += v[0]; m[1] += v[1]; m[2] += v[2]; });
    const len = Math.hypot(m[0], m[1], m[2]);
    centroid = [m[0] / len, m[1] / len, m[2] / len];
    ringArcs = ringVs.map((a, i) => buildArc(a, ringVs![(i + 1) % ringVs!.length], 26, 0.045));
    seedArcs = SEEDERS.map((si) => buildArc(ringVs![si], ringVs![0], 26, 0.06));
    worldArcs = WORLD_RINGS.map((ring) => {
      const vs = ring.map(([lon, lat]) => sph(lon, lat) as V3);
      return vs.map((a, i) => buildArc(a, vs[(i + 1) % vs.length], 26, 0.05));
    });
  }
}

export function drawGlobeStory(ctx: CanvasRenderingContext2D, W: number, H: number, p: number, tMs: number) {
  prep();
  const minD = Math.min(W, H);
  const desktop = W > 768;
  const q0 = ch(0, p), q1 = ch(1, p), q2 = ch(2, p), q3 = ch(3, p);
  const q4 = ch(4, p), q5 = ch(5, p), q6 = ch(6, p), q7 = ch(7, p), q8 = ch(8, p);

  // camera: anchored on the EU ring's centroid, zooming in as the ring
  // becomes the story, then pulling back to the whole globe for the finale
  const zoomOut = easeIO(q8);
  const zoomIn = easeIO(seg(p, 2.2 * CH, 5 * CH));
  const R = lerp(lerp(minD * 1.02, minD * 1.18, zoomIn), minD * 0.29, zoomOut);
  const yaw = lerp(-0.07, -0.35, zoomOut) + tMs * 0.000012 * zoomOut;
  const tilt = lerp(0.72, 0.36, zoomOut);
  rotv(centroid!, 0, yaw, tilt, _cv);
  const ax = desktop ? W * 0.6 : W * 0.5;
  const ay = H * 0.44;
  const gv: GlobeView = {
    cx: lerp(ax - _cv[0] * R, desktop ? W * 0.66 : W * 0.5, zoomOut),
    cy: lerp(ay + _cv[1] * R, H * 0.5, zoomOut),
    R,
    yaw,
    tilt,
    alpha: easeOut(seg(q0, 0, 0.3)),
    dense: R > minD * 0.7,
  };
  drawGlobe(ctx, gv);

  const scr = ringVs!.map((v) => project(v, gv));
  const home = scr[0];

  // ---------- 01 announce ----------
  if (home && p < 2 * CH) {
    const a = easeOut(seg(q0, 0.15, 0.5)) * (1 - easeIO(seg(q1, 0, 0.35)));
    for (let k = 0; k < 3; k++) {
      const phase = (tMs * 0.00045 + k / 3) % 1;
      ripple(ctx, home.x, home.y, 6 + phase * minD * 0.07, (1 - phase) * 0.4 * a);
    }
  }

  // ---------- 02 admit ----------
  if (home && p >= CH * 0.8 && p < 3 * CH) {
    const a = easeIO(seg(q1, 0.05, 0.3)) * (1 - easeIO(seg(q2, 0.4, 0.8)));
    if (a > 0.01) {
      const hx = Math.min(home.x + 46, W - 205), hy = home.y - 66;
      cardBox(ctx, hx - 14, hy - 26, Math.min(W * 0.22, 156) + 28, 152, a);
      ctx.strokeStyle = w(0.3 * a);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(home.x + 4, home.y - 4);
      ctx.lineTo(hx - 8, hy + 30);
      ctx.stroke();
      ctx.setLineDash([]);
      const mw = Math.min(W * 0.22, 156);
      meter(ctx, hx, hy, mw, 'vram', easeOut(seg(q1, 0.25, 0.55)), a);
      meter(ctx, hx, hy + 36, mw, 'uplink', easeOut(seg(q1, 0.35, 0.65)), a);
      meter(ctx, hx, hy + 72, mw, 'latency', easeOut(seg(q1, 0.45, 0.75)), a);
      const st = seg(q1, 0.72, 0.9);
      if (st > 0) label(ctx, 'role · layers 20–31', hx + mw / 2, hy + 106, a * st, 12);
    }
  }

  // ---------- 03 place: the model bar assigned across the region ----------
  const barA = easeIO(seg(q2, 0, 0.3)) * (1 - easeIO(seg(q4, 0.3, 0.7)));
  if (barA > 0.01) {
    // horizontal layer bar across the bottom of the stage
    const n = 24, bw2 = Math.min(W * 0.72, 660);
    const bx = (desktop ? W * 0.58 : W * 0.5) - bw2 / 2;
    const by = H * 0.86;
    const bwUnit = bw2 / n;
    cardBox(ctx, bx - 18, by - 40, bw2 + 36, 104, barA);
    const hiLo = 8, hiHi = 14;
    const hiA = easeIO(seg(q2, 0.3, 0.6));
    const fills = Array.from({ length: hiHi - hiLo }, (_, i) => seg(q3, 0.08 + i * 0.12, 0.36 + i * 0.12));
    for (let i = 0; i < n; i++) {
      const inSlice = i >= hiLo && i < hiHi;
      const a = (inSlice ? 0.35 + 0.65 * hiA : 0.28) * barA;
      ctx.strokeStyle = w(a);
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(bx + i * bwUnit) + 0.5, Math.round(by) + 0.5, Math.round(bwUnit - 2), 19);
      const f = inSlice && q3 > 0 ? clamp01(fills[i - hiLo]) : 0;
      if (f > 0) {
        ctx.fillStyle = w(a * 0.9);
        ctx.fillRect(bx + i * bwUnit + 1.5, by + 1.5, (bwUnit - 5) * f, 16);
      }
    }
    label(ctx, 'the model', bx + bw2 / 2, by + 40, barA, 12);
    // your-slice bracket + line up to the home node
    if (hiA > 0.05 && home) {
      const x0 = bx + hiLo * bwUnit, x1 = bx + hiHi * bwUnit - 2;
      label(ctx, 'your slice', (x0 + x1) / 2, by - 20, barA * hiA, 12);
      ctx.strokeStyle = w(0.25 * barA * hiA * (1 - seg(q3, 0, 0.25)));
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo((x0 + x1) / 2, by - 28);
      ctx.lineTo(home.x, home.y + 8);
      ctx.stroke();
      ctx.setLineDash([]);
      // neighbouring slices assigned to ringmates
      [[2, 14, 20], [4, 2, 8]].forEach(([ci, lo, hi]) => {
        const c = scr[ci];
        if (!c) return;
        ctx.strokeStyle = w(0.12 * barA * hiA);
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(bx + ((lo + hi) / 2) * bwUnit, by - 4);
        ctx.lineTo(c.x, c.y + 6);
        ctx.stroke();
        ctx.setLineDash([]);
      });
    }
  }

  // ---------- 04 pull: peers seed the slice over arcs ----------
  if (q3 > 0 && q3 < 1 && seedArcs) {
    const a = easeIO(seg(q3, 0, 0.2)) * (1 - easeIO(seg(q4, 0, 0.3)));
    seedArcs.forEach((arc, si) => {
      drawArc(ctx, arc, gv, w(0.3 * a), 1, -1);
      if (a > 0.05) {
        for (let k = 0; k < 3; k++) {
          const t = (q3 * 1.6 + k / 3 + si * 0.17) % 1;
          drawArc(ctx, arc, gv, 'rgba(0,0,0,0)', 1, t);
        }
      }
    });
  }

  // ---------- 05 form: green arcs close the ring ----------
  const formA = easeIO(seg(q4, 0.1, 0.4));
  if (formA > 0.01 && ringArcs) {
    ringArcs.forEach((arc, i) => {
      const reveal = easeIO(seg(q4, 0.15 + i * 0.11, 0.5 + i * 0.11));
      drawArc(ctx, arc, gv, green(0.55 * Math.min(1, formA + 0.2)), reveal, -1);
    });
  }

  // ---------- 06 serve: a token loops the ring; receipts pop ----------
  if (q4 >= 1 && p < 8 * CH && ringArcs) {
    const sA = easeIO(seg(q5, 0, 0.2));
    ringArcs.forEach((arc) => drawArc(ctx, arc, gv, green(0.55), 1, -1));
    const lapT = (q5 + (p > 5 * CH ? tMs * 0.00006 : 0)) % 1;
    const pos = lapT * 6;
    const ai = Math.floor(pos) % 6;
    drawArc(ctx, ringArcs[ai], gv, 'rgba(0,0,0,0)', 1, pos - Math.floor(pos));
    if (q5 > 0 && q6 <= 0) {
      for (let i = 0; i < 6; i++) {
        let d = (pos - i + 6) % 6;
        const rA = Math.max(0, 1 - d * 1.1) * sA;
        const c = scr[i];
        if (rA > 0.03 && c) receipt(ctx, c.x + 20, c.y - 24, 1.6, rA, false);
      }
    }
  }

  // ---------- 07 settle + 08 pay: HUD ledger ----------
  const lx = desktop ? W * 0.85 : W * 0.5;
  const ly = desktop ? H * 0.3 : H * 0.14;
  if (q6 > 0) {
    const a = easeIO(seg(q6, 0, 0.25)) * (1 - easeIO(seg(q8, 0, 0.3)));
    cardBox(ctx, lx - 100, ly - 58, 200, 126 + 140 * easeIO(seg(q7, 0, 0.25)), a);
    for (let i = 0; i < 6; i++) {
      const tt = easeIO(seg(q6, 0.05 + i * 0.07, 0.45 + i * 0.07));
      const c = scr[i];
      const sxx = c ? c.x + 20 : gv.cx, syy = c ? c.y - 24 : gv.cy;
      receipt(ctx, lerp(sxx, lx + (i % 2) * 4 - 2, tt), lerp(syy, ly + 8 - i * 8, tt), 1.8,
        a * 0.85, tt >= 1 && seg(q6, 0.5 + i * 0.05, 0.62 + i * 0.05) >= 1);
    }
    label(ctx, 'receipts settle', lx, ly + 52, a * seg(q6, 0.5, 0.8), 13);
  }
  if (q7 > 0) {
    const a = easeIO(seg(q7, 0, 0.25)) * (1 - easeIO(seg(q8, 0, 0.3)));
    coinStack(ctx, lx, ly + 160, 1 + 4 * easeOut(seg(q7, 0.05, 0.8)), 1.4, a);
    label(ctx, 'usdc, per layer', lx, ly + 190, a * seg(q7, 0.45, 0.75), 13);
  }

  // ---------- 09 finale: the rest of the world lights up ----------
  if (q8 > 0 && worldArcs) {
    worldArcs.forEach((ring, ri) => {
      const reveal = seg(q8, 0.3 + ri * 0.14, 0.7 + ri * 0.12);
      ring.forEach((arc, ai) =>
        drawArc(ctx, arc, gv, green(0.5 * gv.alpha), easeOut(reveal), reveal >= 1 ? (tMs * 0.00025 + ai * 0.37) % 1 : -1));
      if (reveal > 0.2) {
        WORLD_RINGS[ri].forEach(([lon, lat]) => {
          const pr = project(sph(lon, lat) as V3, gv);
          if (pr) {
            ctx.fillStyle = green(0.2 * reveal);
            ctx.fillRect((pr.x | 0) - 4, (pr.y | 0) - 4, 8, 8);
            ctx.fillStyle = green(Math.min(1, pr.z + 0.2) * reveal);
            ctx.fillRect((pr.x | 0) - 2, (pr.y | 0) - 2, 4, 4);
          }
        });
      }
    });
    if (ringArcs) ringArcs.forEach((arc, ai) => drawArc(ctx, arc, gv, green(0.5), 1, (tMs * 0.00025 + ai * 0.37) % 1));
  }

  // ---------- city dots (always on top) ----------
  const cityBase = easeOut(seg(q0, 0.1, 0.4));
  scr.forEach((c, i) => {
    if (!c) return;
    const serving = q4 >= 1;
    const isHome = i === 0;
    const a = (isHome ? 1 : p < CH ? 0.35 : 0.35 + 0.65 * easeIO(seg(ch(2, p), 0.3, 0.8))) * cityBase * Math.min(1, c.z + 0.25);
    if (serving) {
      ctx.fillStyle = green(0.2 * a);
      ctx.fillRect((c.x | 0) - 4, (c.y | 0) - 4, 8, 8);
      ctx.fillStyle = green(a);
      ctx.fillRect((c.x | 0) - 2, (c.y | 0) - 2, 4, 4);
    } else {
      ctx.fillStyle = w(a);
      ctx.fillRect((c.x | 0) - 2, (c.y | 0) - 2, 4, 4);
    }
    if (isHome && p < 5 * CH) {
      ctx.strokeStyle = w(0.5 * cityBase);
      ctx.lineWidth = 1;
      ctx.strokeRect((c.x | 0) - 6.5, (c.y | 0) - 6.5, 13, 13);
    }
  });
}

// Variant 1 — "One GPU's journey": a single box lives the whole lifecycle at
// center stage, in the bento-card pixel style; the finale zooms out to the
// real land-dot globe. Driven by global scroll progress p in [0,1] over nine
// chapters (8 steps + finale); tMs adds subtle life while scrolling pauses.
import {
  seg, easeIO, easeOut, lerp, w, green,
  px, pcIcon, ripple, coinStack, receipt, layerStack, meter, label,
  drawGlobe, drawArc, buildArc, project, sph, GlobeView, V3,
} from './art';

const CH = 1 / 9;
const ch = (i: number, p: number) => seg(p, i * CH, (i + 1) * CH);

// EU test-ring cities for the finale rings (the 07-21 rehearsal geography).
const FINALE_RINGS: [number, number][][] = [
  [[4.35, 50.85], [8.7, 50.1], [14.4, 50.1], [2.35, 48.85], [4.9, 52.37], [13.4, 52.5]],
  [[-74.0, 40.7], [-87.6, 41.9], [-79.4, 43.7], [-71.06, 42.36]],
  [[103.8, 1.35], [139.7, 35.7], [126.98, 37.57], [121.47, 31.23]],
  [[-46.6, -23.5], [-58.4, -34.6], [-70.66, -33.45]],
];
let finaleArcs: Float32Array[][] | null = null;
function getFinaleArcs(): Float32Array[][] {
  if (!finaleArcs) {
    finaleArcs = FINALE_RINGS.map((ring) => {
      const vs = ring.map(([lon, lat]) => sph(lon, lat));
      return vs.map((a, i) => buildArc(a as V3, vs[(i + 1) % vs.length] as V3, 26, 0.05));
    });
  }
  return finaleArcs;
}

export function drawJourney(ctx: CanvasRenderingContext2D, W: number, H: number, p: number, tMs: number) {
  const minD = Math.min(W, H);
  const desktop = W > 768;
  const cx = desktop ? W * 0.58 : W * 0.5;
  const cy = desktop ? H * 0.5 : H * 0.4;
  const s = minD / 240; // base pixel unit
  const iconS = 2.6 * s;

  // world fade for the finale
  const q8 = ch(8, p);
  const worldA = 1 - easeIO(seg(q8, 0, 0.45));

  // ring geometry
  const Rr = minD * 0.25;
  const ringPt = (i: number): [number, number] => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 6;
    return [cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr];
  };

  // ---- chapter progress ----
  const q0 = ch(0, p), q1 = ch(1, p), q2 = ch(2, p), q3 = ch(3, p);
  const q4 = ch(4, p), q5 = ch(5, p), q6 = ch(6, p), q7 = ch(7, p);

  // node position: center until FORM, then glides to the top ring slot
  const move = easeIO(seg(q4, 0.05, 0.5));
  const [ntx, nty] = ringPt(0);
  const nx = lerp(cx, ntx, move);
  const ny = lerp(cy, nty, move);

  // peers: parked at the edges until FORM pulls them onto the ring
  const edge: [number, number][] = [
    [W * 0.12, H * 0.16], [W * 0.9, H * 0.14], [W * 0.94, H * 0.62],
    [W * 0.14, H * 0.78], [W * 0.85, H * 0.85],
  ];
  const peers: [number, number][] = edge.map((e, i) => {
    const [tx, ty] = ringPt(i + 1);
    const m = easeIO(seg(q4, 0.05 + i * 0.04, 0.5 + i * 0.04));
    return [lerp(e[0], tx, m), lerp(e[1], ty, m)];
  });
  const peerBaseA = p < 3 * CH ? 0.14 : 0.14 + 0.86 * easeIO(seg(q4, 0, 0.4));

  // ---------- 08 finale: globe under everything ----------
  if (q8 > 0) {
    const gv: GlobeView = {
      cx: desktop ? W * 0.66 : W * 0.5,
      cy: H * 0.48,
      R: minD * (0.26 + 0.05 * easeOut(q8)),
      yaw: -0.45 + q8 * 0.3 + tMs * 0.000012,
      tilt: 0.30,
      alpha: easeIO(seg(q8, 0.1, 0.6)),
    };
    drawGlobe(ctx, gv);
    const arcs = getFinaleArcs();
    arcs.forEach((ring, ri) => {
      const reveal = seg(q8, 0.35 + ri * 0.12, 0.75 + ri * 0.08);
      ring.forEach((a, ai) => {
        drawArc(ctx, a, gv, green(0.5 * gv.alpha), easeOut(reveal), reveal >= 1 ? (tMs * 0.00025 + ai * 0.37) % 1 : -1);
      });
      // serving squares at the ring's cities
      if (reveal > 0.2) {
        FINALE_RINGS[ri].forEach(([lon, lat]) => {
          const pr = project(sph(lon, lat) as V3, gv);
          if (pr) {
            ctx.fillStyle = green(0.2 * reveal * gv.alpha);
            ctx.fillRect((pr.x | 0) - 4, (pr.y | 0) - 4, 8, 8);
            ctx.fillStyle = green(Math.min(1, pr.z + 0.2) * reveal * gv.alpha);
            ctx.fillRect((pr.x | 0) - 2, (pr.y | 0) - 2, 4, 4);
          }
        });
      }
    });
  }

  if (worldA <= 0.01) return;

  // ---------- 01 announce ----------
  const nodeA = easeOut(seg(q0, 0, 0.35)) * worldA;
  if (p < 2 * CH) {
    const bA = (1 - easeIO(seg(q1, 0, 0.35))) * nodeA;
    for (let k = 0; k < 3; k++) {
      const phase = (tMs * 0.00045 + k / 3) % 1;
      ripple(ctx, nx, ny, 16 * s + phase * minD * 0.12, (1 - phase) * 0.35 * bA * easeOut(seg(q0, 0.15, 0.5)));
    }
  }

  // ---------- 02 admit ----------
  if (p >= CH * 0.8 && p < 3 * CH) {
    const a = easeIO(seg(q1, 0.05, 0.3)) * (1 - easeIO(seg(q2, 0.4, 0.8))) * worldA;
    if (a > 0.01) {
      // scan sweep over the box
      const sw = easeIO(seg(q1, 0.05, 0.55));
      if (sw > 0 && sw < 1) {
        const sy = ny - 13 * iconS + sw * 26 * iconS;
        ctx.strokeStyle = green(0.8 * a);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nx - 15 * iconS, sy);
        ctx.lineTo(nx + 15 * iconS, sy);
        ctx.stroke();
      }
      // measured capabilities
      const mx = nx + 20 * iconS;
      const mw = Math.min(W * 0.22, 156);
      meter(ctx, mx, ny - 36, mw, 'vram', easeOut(seg(q1, 0.25, 0.55)), a);
      meter(ctx, mx, ny, mw, 'uplink', easeOut(seg(q1, 0.35, 0.65)), a);
      meter(ctx, mx, ny + 36, mw, 'latency', easeOut(seg(q1, 0.45, 0.75)), a);
      // role stamp
      const st = seg(q1, 0.72, 0.9);
      if (st > 0) {
        ctx.strokeStyle = w(0.5 * a * st);
        const bw2 = 136, bh2 = 26;
        ctx.strokeRect(Math.round(nx - bw2 / 2), Math.round(ny + 16 * iconS), bw2, bh2);
        label(ctx, 'role · layers 20–31', nx, ny + 16 * iconS + bh2 / 2, a * st, 12);
      }
    }
  }

  // ---------- 03 place + 04 pull: the model stack ----------
  const stackA = easeIO(seg(q2, 0, 0.3)) * (1 - easeIO(seg(q4, 0, 0.35))) * worldA;
  const sx = desktop ? cx - minD * 0.28 : cx - W * 0.33;
  if (stackA > 0.01) {
    const n = 12, bw = Math.max(52, minD * 0.11), bh = Math.max(12, minD * 0.03), gap = 4;
    const hiA = easeIO(seg(q2, 0.35, 0.7));
    const fills = [0, 1, 2, 3].map((i) => seg(q3, 0.1 + i * 0.17, 0.42 + i * 0.17));
    // staggered block appearance
    ctx.save();
    ctx.globalAlpha = 1;
    layerStack(ctx, sx, cy, n, bw, bh, gap, stackA, 5, 9, hiA, q3 > 0 ? fills : undefined);
    ctx.restore();
    label(ctx, 'the model', sx, cy - (n * (bh + gap)) / 2 - 18, stackA, 12);
    if (hiA > 0.05) {
      const total = n * bh + (n - 1) * gap;
      const yLo = cy - total / 2 + 5 * (bh + gap), yHi = cy - total / 2 + 9 * (bh + gap) - gap;
      ctx.strokeStyle = w(0.6 * stackA * hiA);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - bw / 2 - 8, yLo);
      ctx.lineTo(sx - bw / 2 - 13, yLo);
      ctx.lineTo(sx - bw / 2 - 13, yHi);
      ctx.lineTo(sx - bw / 2 - 8, yHi);
      ctx.stroke();
      label(ctx, 'your slice', sx - bw / 2 - 22, (yLo + yHi) / 2, stackA * hiA, 12, 'right');
    }
    // assignment line: slice -> node (place)
    const la = easeIO(seg(q2, 0.55, 0.85)) * (1 - seg(q3, 0, 0.2));
    if (la > 0.02) {
      ctx.strokeStyle = w(0.35 * la * stackA);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(sx + bw / 2 + 18, cy);
      ctx.lineTo(nx - 16 * iconS, ny);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // pull: packet streams from two seeder peers into the slice
    if (q3 > 0 && q3 < 1) {
      const seeders = [edge[1], edge[3]];
      seeders.forEach((sd, si) => {
        for (let k = 0; k < 4; k++) {
          const phase = (q3 * 2.6 + k / 4 + si * 0.12) % 1;
          const tx = sx + (si === 0 ? bw / 2 : -bw / 2);
          const pxx = lerp(sd[0], tx, phase);
          const pyy = lerp(sd[1], cy + (si === 0 ? -8 : 8), phase);
          px(ctx, pxx, pyy, 3, w(0.85 * stackA * (phase < 0.06 ? phase / 0.06 : 1)));
        }
      });
    }
  }

  // ---------- 05 form: the ring ----------
  const ringA = easeIO(seg(q4, 0.3, 0.75)) * worldA;
  if (ringA > 0.01) {
    for (let i = 0; i < 6; i++) {
      const segReveal = easeIO(seg(q4, 0.35 + i * 0.08, 0.6 + i * 0.08));
      if (segReveal <= 0) continue;
      const a0 = -Math.PI / 2 + (i * Math.PI * 2) / 6;
      const a1 = a0 + (Math.PI * 2) / 6;
      ctx.strokeStyle = w(0.4 * ringA);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, Rr, a0 + 0.14, a0 + (a1 - a0 - 0.28) * segReveal + 0.14);
      ctx.stroke();
    }
  }

  // ---------- 06 serve: the pulse + receipts trailing it ----------
  const serveA = easeIO(seg(q5, 0, 0.2)) * worldA;
  const ringDone = q4 >= 1;
  if (ringDone && serveA > 0.01 && p < 8 * CH) {
    const laps = q5 + (p > 5 * CH ? tMs * 0.00006 : 0);
    const ang = -Math.PI / 2 + laps * Math.PI * 2;
    const pxx = cx + Math.cos(ang) * Rr, pyy = cy + Math.sin(ang) * Rr;
    // trail
    for (let k = 0; k < 5; k++) {
      const ta = ang - k * 0.09;
      px(ctx, cx + Math.cos(ta) * Rr, cy + Math.sin(ta) * Rr, 3 - k * 0.4, w(serveA * (0.9 - k * 0.17)));
    }
    px(ctx, pxx, pyy, 4, w(serveA));
    // a receipt stub pops behind the pulse at each node it passed (serve only)
    if (q5 > 0 && q6 <= 0) {
      for (let i = 0; i < 6; i++) {
        const nodeAng = -Math.PI / 2 + (i * Math.PI * 2) / 6;
        let d = (ang - nodeAng) % (Math.PI * 2);
        if (d < 0) d += Math.PI * 2;
        const rA = Math.max(0, 1 - d * 1.4) * serveA;
        if (rA > 0.03) {
          const [rx, ry] = ringPt(i);
          receipt(ctx, rx + 20, ry - 26, 1.6, rA, false);
        }
      }
    }
  }

  // ---------- 07 settle + 08 pay: ledger + coins ----------
  const lx = desktop ? cx + minD * 0.4 : cx;
  const ly = desktop ? cy - minD * 0.05 : cy + Rr + 40;
  if (q6 > 0 && worldA > 0.01) {
    const ledgerA = easeIO(seg(q6, 0, 0.25)) * worldA;
    for (let i = 0; i < 6; i++) {
      const tt = easeIO(seg(q6, 0.05 + i * 0.07, 0.45 + i * 0.07));
      const [rx0, ry0] = ringPt(i);
      const rx = lerp(rx0 + 20, lx + (i % 2) * 3 - 1.5, tt);
      const ry = lerp(ry0 - 26, ly - i * 8, tt);
      receipt(ctx, rx, ry, 1.7, ledgerA * 0.85, tt >= 1 && seg(q6, 0.5 + i * 0.05, 0.62 + i * 0.05) >= 1);
    }
    label(ctx, 'receipts settle', lx, ly + 44, ledgerA * seg(q6, 0.5, 0.8), 13);
  }
  if (q7 > 0 && worldA > 0.01) {
    const coinA = easeIO(seg(q7, 0, 0.25)) * worldA;
    const coins = 1 + 4 * easeOut(seg(q7, 0.05, 0.8));
    coinStack(ctx, lx, ly + 148, coins, 1.45, coinA);
    label(ctx, 'usdc, per layer', lx, ly + 178, coinA * seg(q7, 0.45, 0.75), 13);
  }

  // ---------- the cast (drawn last, on top) ----------
  if (worldA > 0.01) {
    peers.forEach(([pxx, pyy], i) => {
      pcIcon(ctx, pxx, pyy, iconS * 0.62, peerBaseA * worldA);
      // serving marker once the ring lives
      if (ringDone && p >= 5 * CH && p < 8 * CH) {
        ctx.fillStyle = green(0.9 * worldA);
        ctx.fillRect(Math.round(pxx - 2), Math.round(pyy + 11 * iconS * 0.62), 4, 4);
      }
    });
    pcIcon(ctx, nx, ny, iconS * (1 - 0.25 * move), Math.max(nodeA, 0.15) * worldA);
    if (ringDone && p >= 5 * CH && p < 8 * CH) {
      ctx.fillStyle = green(worldA);
      ctx.fillRect(Math.round(nx - 2), Math.round(ny + 11 * iconS * 0.75), 4, 4);
    }
  }
}

// Variant 2 — "The network view": the whole story happens ON the real
// land-dot globe (the shard map aesthetic). A Brussels box announces, gets
// measured, pulls its slice from peers, forms an EU ring, serves, settles,
// gets paid — then the camera pulls back and more rings light the map.
import {
  seg, easeIO, easeOut, lerp, w, green,
  ripple, coinStack, receipt, meter, label, cardBox, BG,
  drawGlobe, drawArc, buildArc, project, rotv, sph, GlobeView, V3,
} from './art';

const CH = 1 / 10; // chapter 0 = hero prologue
const ch = (i: number, p: number) => seg(p, (i + 1) * CH, (i + 2) * CH);

// A 6-city EU ring, Brussels as the protagonist.
const RING: { name: string; lon: number; lat: number }[] = [
  { name: 'brussels', lon: 4.35, lat: 50.85 },
  { name: 'amsterdam', lon: 4.9, lat: 52.37 },
  // Nudged north of the real 50.1. At the true latitude it sits 6.5 degrees of
  // arc from prague as seen from the ring's centre, which lands it on top of
  // the centre-to-prague path and breaks the circle. No name is drawn, so the
  // shape wins.
  { name: 'frankfurt', lon: 8.7, lat: 52.9 },
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

  // camera: hero prologue shows a naked, slowly turning globe beside the
  // copy; scrolling flies it into the centroid-anchored story framing, and
  // the finale pulls back to the whole globe
  const zoomOut = easeIO(q8);
  const zoomIn = easeIO(seg(p, 3.2 * CH, 6 * CH));
  const heroT = 1 - easeIO(seg(p, 0.03 * CH, CH));
  const sR = lerp(lerp(minD * 1.02, minD * 1.18, zoomIn), minD * 0.29, zoomOut);
  const sYaw = lerp(-0.07, -0.35, zoomOut) + tMs * 0.000012 * zoomOut;
  const sTilt = lerp(0.72, 0.36, zoomOut);
  rotv(centroid!, 0, sYaw, sTilt, _cv);
  const ax = desktop ? W * 0.6 : W * 0.5;
  const ay = H * 0.44;
  // The finale now closes on the hero prompt rather than a line of text, so the
  // globe has to clear the copy column the way it does in the opening hero —
  // at 0.66 its left rim and the Brazil coastline printed straight through the
  // composer, with the send arrow sitting on top of coastline dots. Same
  // fraction as the prologue, so both ends of the story frame identically.
  const sCx = lerp(ax - _cv[0] * sR, desktop ? W * 0.76 : W * 0.5, zoomOut);
  const sCy = lerp(ay + _cv[1] * sR, H * 0.5, zoomOut);
  const hYaw = -0.6 + tMs * 0.000025;
  const R = lerp(sR, minD * (desktop ? 0.38 : 0.48), heroT);
  const gv: GlobeView = {
    cx: lerp(sCx, desktop ? W * 0.76 : W * 0.5, heroT),
    cy: lerp(sCy, desktop ? H * 0.5 : H * 0.42, heroT),
    R,
    yaw: lerp(sYaw, hYaw, heroT),
    tilt: lerp(sTilt, 0.32, heroT),
    alpha: 1,
  };
  drawGlobe(ctx, gv);

  const scr = ringVs!.map((v) => project(v, gv));
  const home = scr[0];

  // ---------- 01 announce ----------
  if (home && p >= 0.9 * CH && p < 3 * CH) {
    const a = easeOut(seg(q0, 0.15, 0.5)) * (1 - easeIO(seg(q1, 0, 0.35)));
    for (let k = 0; k < 3; k++) {
      const phase = (tMs * 0.00045 + k / 3) % 1;
      ripple(ctx, home.x, home.y, 6 + phase * minD * 0.07, (1 - phase) * 0.4 * a);
    }
  }

  // ── the plate ───────────────────────────────────────────────────────────────
  // One rectangle in the right margin, opposite the copy column. Every scene
  // that needs a diagram draws into this same rect, so the story reads as a
  // single plate whose contents change as it advances rather than as cards
  // surfacing in different places each chapter.
  const tall = desktop;
  const pad = tall ? 22 : 14;
  // The header and caption bands. A scene puts its title in the first and its
  // conclusion in the last, which is what keeps three different diagrams
  // reading as one object.
  const hdr = tall ? 40 : 26, cap = tall ? 24 : 13;
  const LEAVES = 32;
  const pitchMax = tall ? 6 : 4, gapU = tall ? 9 : 5;
  // Sized from the gap it has to live in: the copy column runs from 26% to
  // 26% + max-w-sm, so the plate takes what is left before the right margin,
  // which itself has to clear the progress ticks 40px in.
  const rail = 72;
  const colR = W * 0.26 + 384;
  const plateW = tall
    ? Math.max(196, Math.min(300, W - rail - colR - 24))
    : Math.min(W - 2 * Math.max(16, W * 0.045), 500);
  // Height comes from the densest tenant — the leaf block of scene 03. A text
  // block is dense, so its pitch is fixed and the plate is cut to fit it.
  const plateH = tall
    ? LEAVES * pitchMax + gapU * 2 + hdr + cap + 2 * pad
    : Math.min(H * 0.25, 250, Math.max(172, H * 0.44 - 104 - 86));
  const plateX = tall ? W - rail - plateW : W * 0.5 - plateW / 2;
  const plateY = tall ? (H - plateH) / 2 : 86;
  const plateCx = plateX + plateW / 2;
  // The band between the header and the caption. Every scene lays its content
  // out inside this, which is what makes three different diagrams sit on the
  // same baselines as the plate changes hands.
  const bandTop = plateY + pad + hdr;
  const bandBot = plateY + plateH - pad - cap;
  // A plate is opaque. cardBox alone leaves 8% of the ground showing, and the
  // land dots run directly underneath and print through it.
  const plate = (alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(plateX, plateY, plateW, plateH, 24);
    ctx.fillStyle = BG;
    ctx.fill();
    ctx.restore();
    cardBox(ctx, plateX, plateY, plateW, plateH, alpha);
  };

  // ---------- 02 admit ----------
  if (home && p >= CH * 1.8 && p < 4 * CH) {
    // Leaves early now that the layer plate lands on the same side of the
    // screen. It used to hold through 80% of the Place chapter, which was
    // harmless while the plate was in the opposite margin and is a collision
    // now; the role it reports is restated on the plate anyway.
    const a = easeIO(seg(q1, 0.05, 0.3)) * (1 - easeIO(seg(q2, 0.05, 0.3)));
    if (a > 0.01) {
      plate(a);
      // A leader back to the box being measured. It is struck to the plate's
      // near edge rather than into the copy, so it reads as a callout.
      ctx.strokeStyle = w(0.22 * a);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(home.x + 4, home.y - 4);
      ctx.lineTo(plateX - 10, plateY + plateH / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      label(ctx, 'your box', plateX + pad, plateY + pad + 6, a, tall ? 12 : 10.5, 'left');
      label(ctx, 'measured', plateX + pad, plateY + pad + 23, a * 0.6, tall ? 9.5 : 8.5, 'left');

      // The meters sit inside a further inset. At the old width they ran the
      // full inner span and the 'vram' label sat inside the corner arc, which
      // is what made the card feel crowded.
      const mw = plateW - 2 * pad - (tall ? 26 : 12);
      const mx = plateX + pad;
      const row = tall ? 62 : 30;
      // Centred in the band. Stacked from the top they left a dead third of
      // the plate under 'latency'.
      const m0 = bandTop + Math.max(6, (bandBot - bandTop - (row * 2 + 18)) / 2) + 13;
      meter(ctx, mx, m0, mw, 'vram', easeOut(seg(q1, 0.25, 0.55)), a);
      meter(ctx, mx, m0 + row, mw, 'uplink', easeOut(seg(q1, 0.35, 0.65)), a);
      meter(ctx, mx, m0 + row * 2, mw, 'latency', easeOut(seg(q1, 0.45, 0.75)), a);
      const st = seg(q1, 0.72, 0.9);
      if (st > 0) {
        label(ctx, 'role · layers 20–31', plateCx, plateY + plateH - pad - (tall ? 8 : 4),
          a * st, tall ? 9 : 8.5);
      }
    }
  }

  // ---------- 03 place: one volume, gathered ----------
  // The model is drawn as the fore-edge of a bound text block — thirty-two
  // leaves in order, one object with a head and a foot. It then parts at two
  // points into gatherings, and a brace is struck in the margin beside each
  // one; a gathering is what a single machine holds, and the braces abut so
  // every leaf is inside exactly one of them. Nothing traverses and nothing
  // fills: an allocation is a division that settles, not a run that advances.
  // Arrives after scene 02's card has left the right margin, and holds through
  // Pull — the layers being torrented there are the ones marked here — then
  // goes with it. Place and Pull only.
  const placeA = easeIO(seg(q2, 0.32, 0.6)) * (1 - easeIO(seg(q3, 0.7, 1)));
  if (placeA > 0.01) {
    const N = LEAVES;
    const RUNS: [number, number][] = [[0, 8], [8, 12], [20, 12]];
    const MINE = 2; // layers 20-31, the role scene 02 just handed out
    const open = easeOut(seg(q2, 0.36, 0.62));
    const peerK = easeOut(seg(q2, 0.48, 0.74));
    const mineK = easeOut(seg(q2, 0.62, 0.9));

    plate(placeA);

    // The label column only has to hold 'another box' and 'layers 20-31'; at 92
    // it was eating the stack on a narrower laptop, where every pixel the
    // margin gives back goes to the leaves.
    const braceW = 15, labW = tall ? 72 : 100, gapL = 10, gapR = 12;
    const stackW = Math.min(plateW - 2 * pad - braceW - gapL - gapR - labW, tall ? 132 : 150);
    const gx = tall ? plateX + pad : plateX + (plateW - (braceW + gapL + stackW + gapR + labW)) / 2;
    const sx3 = gx + braceW + gapL;
    const lx3 = sx3 + stackW + gapR;
    const availH = plateH - 2 * pad - hdr - cap;
    const pitch = Math.min(pitchMax, (availH - gapU * 2) / N);
    const leafH = tall ? 2 : 1;
    const gap = gapU * open;
    // The block is pinned at its centre, so the gatherings part outward as they
    // are handed out rather than sliding off in one direction.
    const startY = plateY + pad + hdr + availH / 2 - (N * pitch + 2 * gap) / 2;
    const yOf = (i: number, r: number) => startY + i * pitch + r * gap;

    label(ctx, 'the model', gx, plateY + pad + (tall ? 6 : 4), placeA, tall ? 12 : 10.5, 'left');
    label(ctx, '32 layers · 64 gb', gx, plateY + pad + (tall ? 23 : 18), placeA * 0.6, tall ? 9.5 : 8.5, 'left');

    // the leaves — a fore-edge is never flush, so the right end wanders a little
    RUNS.forEach(([s0, len], r) => {
      const k = r === MINE ? mineK : peerK;
      ctx.fillStyle = w(lerp(0.32, r === MINE ? 0.95 : 0.52, k) * placeA);
      for (let i = s0; i < s0 + len; i++)
        // Rounded only where the pitch is a whole number; on the short plate the
        // pitch is fractional and snapping it would stripe unevenly.
        ctx.fillRect(Math.round(sx3), pitch % 1 ? yOf(i, r) : Math.round(yOf(i, r)),
          Math.round(stackW - (((i * 37) % 11) / 11) * (tall ? 4 : 3)), leafH);
    });

    // the margin braces, struck outward from the middle of each gathering
    const braceX = Math.round(gx + braceW) - 0.5;
    RUNS.forEach(([s0, len], r) => {
      const k = r === MINE ? mineK : peerK;
      if (k <= 0.01) return;
      const y0 = yOf(s0, r) - pitch * 0.3, y1 = yOf(s0 + len - 1, r) + pitch * 0.3;
      const mid = (y0 + y1) / 2, half = ((y1 - y0) / 2) * easeOut(Math.min(1, k * 1.2));
      const a = (r === MINE ? 0.85 : 0.32) * placeA * k;
      ctx.strokeStyle = w(a);
      ctx.lineWidth = r === MINE ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(braceX, mid - half);
      ctx.lineTo(braceX, mid + half);
      ctx.stroke();
      if (k > 0.6) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = w(a * ((k - 0.6) / 0.4));
        ctx.beginPath();
        for (const e of [mid - half, mid + half]) {
          ctx.moveTo(braceX - 5, Math.round(e) + 0.5);
          ctx.lineTo(braceX, Math.round(e) + 0.5);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    });

    // who holds what, set in the margin beside its brace
    RUNS.forEach(([s0, len], r) => {
      const k = r === MINE ? mineK : peerK;
      if (k <= 0.02) return;
      const mid = (yOf(s0, r) + yOf(s0 + len - 1, r)) / 2;
      if (r === MINE) {
        label(ctx, 'your box', lx3, mid - (tall ? 12 : 10), placeA * k, tall ? 10.5 : 9.5, 'left');
        label(ctx, 'layers 20–31', lx3, mid + (tall ? 1 : 0), placeA * k * 0.6, tall ? 8.5 : 8, 'left');
        label(ctx, '24 gb', lx3, mid + (tall ? 14 : 11), placeA * k * 0.6, tall ? 8.5 : 8, 'left');
      } else {
        label(ctx, 'another box', lx3, mid, placeA * k * 0.5, tall ? 9 : 8.5, 'left');
      }
    });

    label(ctx, 'every layer held once', plateX + plateW / 2, plateY + plateH - pad - (tall ? 8 : 4),
      placeA * Math.min(peerK, mineK) * 0.55, tall ? 9 : 8.5);
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
  if (q4 >= 1 && p < 9 * CH && ringArcs) {
    const sA = easeIO(seg(q5, 0, 0.2));
    ringArcs.forEach((arc) => drawArc(ctx, arc, gv, green(0.55), 1, -1));
    const lapT = (q5 + (p > 6 * CH ? tMs * 0.00006 : 0)) % 1;
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

  // ---------- 07 settle + 08 pay: the ledger ----------
  // Settle and pay are one plate, not two: the receipts land in it and the
  // payout follows underneath them, so the reader watches one page fill in.
  // The plate no longer grows as pay arrives — a fixed rect is what lets it be
  // the same object the earlier chapters drew into.
  const lx = tall ? plateCx : W * 0.5;
  const ly = tall ? bandTop + 46 : bandTop + 24;
  const ledgerA = easeIO(seg(q6, 0, 0.25)) * (1 - easeIO(seg(q8, 0, 0.3)));
  // A phone's plate has about a third of the content band a desktop's has —
  // not enough for the receipts and the payout at once, which had the coins
  // stacking straight up through 'receipts settle'. There the plate hands over
  // instead of accumulating: the receipts clear as the payout arrives.
  const swap = tall ? 0 : easeIO(seg(q7, 0, 0.3));
  if (ledgerA > 0.01) {
    plate(ledgerA);
    label(ctx, 'the ledger', plateX + pad, plateY + pad + 6, ledgerA, tall ? 12 : 10.5, 'left');
    label(ctx, 'signed work', plateX + pad, plateY + pad + 23, ledgerA * 0.6, tall ? 9.5 : 8.5, 'left');
  }
  if (q6 > 0) {
    const a = ledgerA;
    for (let i = 0; i < 6; i++) {
      const tt = easeIO(seg(q6, 0.05 + i * 0.07, 0.45 + i * 0.07));
      const c = scr[i];
      const sxx = c ? c.x + 20 : gv.cx, syy = c ? c.y - 24 : gv.cy;
      receipt(ctx, lerp(sxx, lx + (i % 2) * 4 - 2, tt), lerp(syy, ly + 8 - i * 8, tt), 1.8,
        a * 0.85 * (1 - swap), tt >= 1 && seg(q6, 0.5 + i * 0.05, 0.62 + i * 0.05) >= 1);
    }
    label(ctx, 'receipts settle', lx, ly + 34, a * seg(q6, 0.5, 0.8) * (1 - swap), tall ? 10.5 : 9.5);
  }
  if (q7 > 0) {
    const a = easeIO(seg(q7, 0, 0.25)) * (1 - easeIO(seg(q8, 0, 0.3)));
    // Sat on the band's floor rather than a fixed offset from the receipts:
    // a stack grows upward from its base, so anchoring it to the top ran it
    // straight through the 'receipts settle' line as it filled.
    coinStack(ctx, lx, bandBot - (tall ? 10 : 4), 1 + 4 * easeOut(seg(q7, 0.05, 0.8)), tall ? 1.4 : 1, a);
    label(ctx, 'usdc, per layer', plateCx, plateY + plateH - pad - (tall ? 8 : 4),
      a * seg(q7, 0.45, 0.75), tall ? 9 : 8.5);
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
            ctx.beginPath(); ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = green(Math.min(1, pr.z + 0.2) * reveal);
            ctx.beginPath(); ctx.arc(pr.x, pr.y, 2, 0, Math.PI * 2); ctx.fill();
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
    const a = (isHome ? 1 : p < 2 * CH ? 0.35 : 0.35 + 0.65 * easeIO(seg(ch(2, p), 0.3, 0.8))) * cityBase * Math.min(1, c.z + 0.25);
    if (serving) {
      ctx.fillStyle = green(0.2 * a);
      ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = green(a);
      ctx.beginPath(); ctx.arc(c.x, c.y, 2, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = w(a);
      ctx.beginPath(); ctx.arc(c.x, c.y, 2, 0, Math.PI * 2); ctx.fill();
    }
    if (isHome && p < 6 * CH) {
      ctx.strokeStyle = w(0.5 * cityBase);
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c.x, c.y, 7, 0, Math.PI * 2); ctx.stroke();
    }
  });
}

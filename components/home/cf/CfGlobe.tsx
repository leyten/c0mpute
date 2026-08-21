'use client';

// The reference globe restated on our 2D land-dot machinery instead of
// three.js. Measured geometry: sphere centred horizontally with its centre at
// 66% of the container height and R = 0.575H (bottom clipped by the
// container), idle autorotate at 1.8 deg/s with a -14.3 deg roll, a hairline
// graticule (24 meridians, 7.5-degree parallels, 12 full rings for the
// criss-cross), land dots ~2.6px on a ~6.9px pitch with the far side washed
// out, and arcs that grow over 1.5s and retract over 0.55s between cities.
// Pauses off-screen; enters by scaling from 0.97 once the first frame is in.
import { useEffect, useRef } from 'react';
import { land, landDense, landCoarse, sph } from '../scrollstage/land';
import { rotv, buildArc, w, steel, clamp01, V3 } from '../scrollstage/art';

// Graticule polylines as unit vectors, built once.
let _grat: Float32Array[] | null = null;
function graticule(): Float32Array[] {
  if (_grat) return _grat;
  const out: Float32Array[] = [];
  const line = (pts: number[]) => out.push(new Float32Array(pts));
  // 24 half-meridians
  for (let b = 0; b < 24; b++) {
    const lon = -180 + 15 * b, a: number[] = [];
    for (let lat = -90; lat <= 90; lat += 3) { const p = sph(lon, lat); a.push(p[0], p[1], p[2]); }
    line(a);
  }
  // parallels every 7.5 degrees (skip within 5 of the equator) + the equator
  for (let b = 0; b < 23; b++) {
    const lat = -90 + 7.5 * (b + 1);
    if (Math.abs(lat) < 5 || lat >= 90) continue;
    const a: number[] = [];
    for (let lon = -180; lon <= 180; lon += 3) { const p = sph(lon, lat); a.push(p[0], p[1], p[2]); }
    line(a);
  }
  {
    const a: number[] = [];
    for (let lon = -180; lon <= 180; lon += 3) { const p = sph(lon, 0); a.push(p[0], p[1], p[2]); }
    line(a);
  }
  // 12 full polar rings at 30-degree steps — read as diagonals under the roll
  for (let k = 0; k < 6; k++) {
    const lon = -180 + 30 * k, a: number[] = [];
    for (let th = 0; th <= 360; th += 3) {
      const lat = th <= 180 ? th - 90 : 270 - th;
      const p = sph(th <= 180 ? lon : lon + 180, lat);
      a.push(p[0], p[1], p[2]);
    }
    line(a);
  }
  _grat = out;
  return out;
}

const CITIES: [number, number][] = [
  [4.35, 50.85], [-74.0, 40.7], [103.8, 1.35], [139.7, 35.7],
  [-46.6, -23.5], [-0.13, 51.5], [77.2, 28.6], [-122.4, 37.8],
];
// Deterministic pair sequence — a new arc starts every 2.2s, three phases:
// grow 1.5s (ease-out cubic), hold, fade 0.55s.
const PAIRS: [number, number][] = [[0, 3], [5, 1], [2, 7], [4, 5], [6, 0], [1, 2], [3, 6], [7, 4]];
const ARC_PERIOD = 2200, ARC_LIFE = 4400;

const outC = (x: number) => 1 - Math.pow(1 - x, 3);
const _t: V3 = [0, 0, 0];

export default function CfGlobe({ onReady }: { onReady?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cityVs = CITIES.map(([lon, lat]) => sph(lon, lat) as V3);
    const arcs = PAIRS.map(([a, b]) => buildArc(cityVs[a], cityVs[b], 40, 0.075));

    let W = 0, H = 0, raf = 0, ready = false, inView = true;
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
      const R = Math.min(0.575 * H, 0.44 * W);
      const yaw = -0.4 - (still ? 0 : t * 0.0000314); // 1.8 deg/s, land drifts left-to-right
      const tilt = 0.15;
      ctx.save();
      ctx.translate(W / 2, 0.66 * H);
      ctx.rotate(-0.25); // the reference's z-roll

      // graticule, front hemisphere only
      ctx.strokeStyle = w(0.07);
      ctx.lineWidth = 1;
      for (const line of graticule()) {
        const n = line.length / 3;
        ctx.beginPath();
        let up = false;
        for (let i = 0; i < n; i++) {
          rotv(line, i * 3, yaw, tilt, _t);
          if (_t[2] > 0) {
            const X = _t[0] * R, Y = -_t[1] * R;
            if (up) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
            up = true;
          } else up = false;
        }
        ctx.stroke();
      }

      // land dots: grid picked for a ~6.9px pitch, far side washed (the fog)
      const idealDeg = 6.9 / (Math.max(24, R) * (Math.PI / 180));
      const L = idealDeg >= 1.7 ? landCoarse() : idealDeg >= 0.7 ? land() : landDense();
      const spacing = R * (idealDeg >= 1.7 ? 2 : idealDeg >= 0.7 ? 1 : 0.5) * (Math.PI / 180);
      const d = Math.max(2, Math.min(3, Math.round(spacing * 0.4)));
      const n = L.length / 3;
      const lim = R + 8;
      for (let i = 0; i < n; i++) {
        rotv(L, i * 3, yaw, tilt, _t);
        const sx = _t[0] * R, sy = -_t[1] * R;
        if (sx < -lim || sx > lim || sy < -lim || sy > lim) continue;
        ctx.fillStyle = _t[2] > 0.02 ? steel(0.45 + 0.4 * _t[2]) : steel(0.05);
        ctx.fillRect(sx | 0, sy | 0, d, d);
      }

      // arcs: one starts every ARC_PERIOD, grows, holds, fades
      if (!still) {
        for (let k = 0; k < PAIRS.length; k++) {
          const age = (t - k * ARC_PERIOD) % (PAIRS.length * ARC_PERIOD);
          if (age < 0 || age > ARC_LIFE) continue;
          const grow = outC(clamp01(age / 1500));
          const fade = age > ARC_LIFE - 550 ? 1 - (age - (ARC_LIFE - 550)) / 550 : 1;
          if (fade <= 0.02) continue;
          const pts = arcs[k];
          const m = pts.length / 3;
          const upto = Math.max(2, Math.floor(m * grow));
          ctx.strokeStyle = steel(0.8 * fade);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          let up = false;
          for (let i = 0; i < upto; i++) {
            rotv(pts, i * 3, yaw, tilt, _t);
            if (_t[2] > 0) {
              const X = _t[0] * R, Y = -_t[1] * R;
              if (up) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
              up = true;
            } else up = false;
          }
          ctx.stroke();
          // endpoints
          for (const ci of PAIRS[k]) {
            rotv(cityVs[ci], 0, yaw, tilt, _t);
            if (_t[2] > 0) {
              ctx.fillStyle = steel(fade);
              ctx.fillRect(((_t[0] * R) | 0) - 2, ((-_t[1] * R) | 0) - 2, 4, 4);
            }
          }
        }
      }
      ctx.restore();

      if (!ready) {
        ready = true;
        // double-rAF so the entrance transition sees the pre-scale state
        requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
      }
      if (!still && inView) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // pause the loop off-screen (the reference switches frameloop to demand)
    const io = new IntersectionObserver(
      ([e]) => {
        const was = inView;
        inView = e.isIntersecting;
        if (!still && inView && !was) raf = requestAnimationFrame(draw);
      },
      { rootMargin: '160px' }
    );
    io.observe(canvas);

    let rz: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { layout(); if (still) draw(0); }, 120); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', onResize);
      clearTimeout(rz);
    };
  }, [onReady]);

  return <canvas ref={ref} className="w-full h-full" aria-hidden />;
}

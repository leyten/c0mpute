// Shared drawing vocabulary for the scroll stage — the bento-card art style
// (blocky ink-on-ground pixel icons, halftone dot fills, 1px strokes, 2-3px
// square packets) reproduced on canvas, plus timeline + globe helpers.
import { land, landDense, landCoarse, sph } from './land';

// ---------- palette ----------
// A canvas has no cascade, so `var(--fg)` means nothing to fillStyle: the four
// colours this vocabulary paints with are read off <html> as literal values
// instead, and re-read whenever `data-theme` flips. Reading at module scope is
// safe and correct on the client — the attribute is stamped in <head> by the
// no-flash script before any bundle evaluates, so the very first frame already
// has the right ground. `BG` stays an exported binding rather than a getter so
// the idle-card canvases that import it need no change; ES module bindings are
// live, so reassigning it here updates them too.
type RGB = [number, number, number];

let FG: RGB = [255, 255, 255];
let LIVE: RGB = [52, 211, 153];
let STEEL: RGB = [128, 160, 193];
let BG_RGB: RGB = [12, 10, 9];
export let BG = '#0c0a09'; // the page ground, whichever theme is showing

const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;

// Custom properties come back exactly as authored (`#fff`, `rgba(…)`), so a
// throwaway 2D context does the normalising rather than a hand-rolled parser.
let _norm: CanvasRenderingContext2D | null = null;
function toRGB(value: string, fallback: RGB): RGB {
  const v = value.trim();
  if (!v) return fallback;
  if (!_norm) _norm = document.createElement('canvas').getContext('2d');
  if (!_norm) return fallback;
  _norm.fillStyle = v;
  const s = _norm.fillStyle as string;
  if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : fallback;
}

function readTheme() {
  const cs = getComputedStyle(document.documentElement);
  FG = toRGB(cs.getPropertyValue('--fg'), FG);
  // --live carries its own alpha; only the hue is wanted here, since every
  // call site supplies the alpha it needs.
  LIVE = toRGB(cs.getPropertyValue('--live'), LIVE);
  STEEL = toRGB(cs.getPropertyValue('--steel'), STEEL);
  const bg = cs.getPropertyValue('--background').trim();
  BG_RGB = toRGB(bg, BG_RGB);
  BG = bg || BG;
  _coinPats = new WeakMap(); // the cached halftone tiles are painted in FG
}

// The first read and the observer are armed at the very bottom of this file:
// readTheme() drops the coin-pattern cache, which is declared further down,
// and calling it from here would hit that binding in its dead zone.

// ---------- timeline ----------
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const seg = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const easeIO = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const w = (a: number) => rgba(FG, a);
export const green = (a: number) => rgba(LIVE, a);
export const steel = (a: number) => rgba(STEEL, a);

let FONT = 'monospace';
export function setLabelFont(family: string) { FONT = family || 'monospace'; }

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number, size = 10, align: CanvasTextAlign = 'center') {
  if (alpha <= 0.01) return;
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = w(alpha * 0.75);
  // manual tracking, matching the cards' tracking-wider labels
  const t = text.toUpperCase().split('').join(' ');
  ctx.fillText(t, x, y);
}

// ---------- pixel primitives ----------
export function px(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.round(s), Math.round(s));
}

// The PC/monitor icon from OrchestratorFlow's PCIcon, unit-scaled (24x22 grid).
export function pcIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, alpha: number) {
  if (alpha <= 0.01) return;
  const u = (ux: number, uy: number, uw: number, uh: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(cx + (ux - 12) * s), Math.round(cy + (uy - 11) * s), Math.round(uw * s), Math.round(uh * s));
  };
  u(2, 0, 20, 14, w(alpha));
  u(4, 2, 16, 10, BG);
  u(6, 4, 2, 2, w(alpha));
  u(10, 4, 4, 2, w(alpha));
  u(6, 7, 8, 2, w(alpha));
  u(10, 14, 4, 2, w(alpha));
  u(6, 16, 12, 2, w(alpha));
}

// HUD card: the site's card language (rounded corner + hairline border) so
// canvas overlays read as cards, not floating black boxes.
export function cardBox(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, ht: number, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.beginPath();
  ctx.roundRect(x, y, wd, ht, 14);
  ctx.fillStyle = rgba(BG_RGB, 0.85 * alpha);
  ctx.fill();
  ctx.strokeStyle = w(0.12 * alpha);
  ctx.lineWidth = 1;
  ctx.stroke();
}

// Soft radar ping: expanding thin circles (announce) — calm, map-language.
export function ripple(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.strokeStyle = w(alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

// Halftone dot fill (EarningsVisual coin-side pattern).
export function halftone(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, ht: number, alpha: number, spacing = 4, r = 1.1) {
  if (alpha <= 0.01) return;
  ctx.fillStyle = w(alpha);
  for (let yy = y + spacing / 2; yy < y + ht; yy += spacing)
    for (let xx = x + spacing / 2; xx < x + wd; xx += spacing) {
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
}

// Coin stack, faithful to EarningsVisual's SVG geometry: each coin is a side
// band with an elliptical bottom bulge (halftone-patterned) plus a stroked
// top ellipse; lower faces carry the fine surface pattern, the top coin is
// dark with a $. Patterns are cached per-context tile canvases.
let _coinPats = new WeakMap<CanvasRenderingContext2D, Map<number, { side: CanvasPattern | null; surface: CanvasPattern | null }>>();
function coinPatterns(ctx: CanvasRenderingContext2D, s: number) {
  let m = _coinPats.get(ctx);
  if (!m) { m = new Map(); _coinPats.set(ctx, m); }
  const bucket = Math.max(1, Math.round(s * 2) / 2);
  let p = m.get(bucket);
  if (!p) {
    const mk = (size: number, r: number) => {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d')!;
      g.fillStyle = w(1);
      g.beginPath();
      g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      g.fill();
      return ctx.createPattern(c, 'repeat');
    };
    p = { surface: mk(Math.round(3 * bucket), 0.7 * bucket), side: mk(Math.round(4 * bucket), 1.15 * bucket) };
    m.set(bucket, p);
  }
  return p;
}

export function coinStack(ctx: CanvasRenderingContext2D, cx: number, yBottom: number, coins: number, s: number, alpha: number) {
  if (alpha <= 0.01 || coins <= 0) return;
  const rx = 28 * s, ry = 9 * s, step = 10 * s, band = 8 * s;
  const pats = coinPatterns(ctx, s);
  const full = Math.floor(coins);
  const frac = coins - full;
  const total = full + (frac > 0 ? 1 : 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1;
  // the very bottom ellipse of the stack
  ctx.beginPath();
  ctx.ellipse(cx, yBottom, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = (pats.side as CanvasPattern) ?? w(0.3);
  ctx.fill();
  ctx.strokeStyle = w(1);
  ctx.stroke();
  for (let i = 0; i < total; i++) {
    const isTop = i === total - 1;
    if (isTop && frac > 0) ctx.globalAlpha = alpha * frac;
    const y = yBottom - i * step;   // bottom plane of this coin
    const yT = y - band;            // top plane of this coin
    // side band with the elliptical bottom bulge
    ctx.beginPath();
    ctx.moveTo(cx - rx, yT);
    ctx.lineTo(cx - rx, y);
    ctx.ellipse(cx, y, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(cx + rx, yT);
    ctx.fillStyle = isTop ? w(0.12) : ((pats.side as CanvasPattern) ?? w(0.3));
    ctx.fill();
    ctx.strokeStyle = w(1);
    ctx.stroke();
    // top face
    ctx.beginPath();
    ctx.ellipse(cx, yT, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = i >= total - 2 ? BG : ((pats.surface as CanvasPattern) ?? BG);
    ctx.fill();
    ctx.lineWidth = isTop ? 1.5 : 1;
    ctx.stroke();
    ctx.lineWidth = 1;
    if (isTop) {
      ctx.font = `${Math.max(10, Math.round(11 * s))}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = w(1);
      ctx.fillText('$', cx, yT + 3.5 * s);
    }
  }
  ctx.restore();
}

// Small receipt stub: doc rect + lines + check when settled.
export function receipt(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, alpha: number, checked: boolean) {
  if (alpha <= 0.01) return;
  const wd = 12 * s, ht = 15 * s;
  const x = cx - wd / 2, y = cy - ht / 2;
  ctx.fillStyle = BG;
  ctx.fillRect(x, y, wd, ht);
  ctx.strokeStyle = w(alpha);
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(wd), Math.round(ht));
  ctx.fillStyle = w(alpha * 0.8);
  ctx.fillRect(x + 2 * s, y + 3 * s, 8 * s, 1.4 * s);
  ctx.fillRect(x + 2 * s, y + 6 * s, 6 * s, 1.4 * s);
  if (checked) {
    ctx.strokeStyle = green(alpha);
    ctx.lineWidth = Math.max(1, 1.4 * s);
    ctx.beginPath();
    ctx.moveTo(x + 3 * s, y + 10.5 * s);
    ctx.lineTo(x + 5.2 * s, y + 12.5 * s);
    ctx.lineTo(x + 9.5 * s, y + 8.5 * s);
    ctx.stroke();
  } else {
    ctx.fillStyle = w(alpha * 0.8);
    ctx.fillRect(x + 2 * s, y + 9 * s, 7 * s, 1.4 * s);
  }
}

// Stack of model layer blocks; hi range highlighted; fills show pull progress.
export function layerStack(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, n: number, bw: number, bh: number, gap: number,
  alpha: number, hiLo: number, hiHi: number, hiAlpha: number, fills?: number[],
) {
  if (alpha <= 0.01) return;
  const total = n * bh + (n - 1) * gap;
  for (let i = 0; i < n; i++) {
    const y = cy - total / 2 + i * (bh + gap);
    const inSlice = i >= hiLo && i < hiHi;
    const a = inSlice ? alpha * (0.35 + 0.65 * hiAlpha) : alpha * 0.3;
    ctx.strokeStyle = w(a);
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(cx - bw / 2) + 0.5, Math.round(y) + 0.5, Math.round(bw), Math.round(bh));
    const f = fills && inSlice ? clamp01(fills[i - hiLo] ?? 0) : 0;
    if (f > 0) {
      ctx.fillStyle = w(a * 0.85);
      ctx.fillRect(cx - bw / 2 + 1.5, y + 1.5, (bw - 3) * f, bh - 3);
    }
    if (f >= 1) {
      // verified tick to the right of the block
      ctx.strokeStyle = green(alpha);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + bw / 2 + 5, y + bh * 0.55);
      ctx.lineTo(cx + bw / 2 + 8, y + bh * 0.85);
      ctx.lineTo(cx + bw / 2 + 13, y + bh * 0.2);
      ctx.stroke();
    }
  }
}

// Measured-capability bar (admit scene), named — card-attached text stays.
export function meter(ctx: CanvasRenderingContext2D, x: number, y: number, wd: number, name: string, fill: number, alpha: number) {
  if (alpha <= 0.01) return;
  label(ctx, name, x, y - 11, alpha, 12, 'left');
  ctx.strokeStyle = w(alpha * 0.5);
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(wd), 10);
  ctx.fillStyle = w(alpha * 0.9);
  ctx.fillRect(x + 1.5, y + 1.5, (wd - 3) * clamp01(fill), 7);
}

// ---------- globe ----------
export type V3 = [number, number, number];

export function rotv(p: V3 | Float32Array, off: number, yaw: number, tilt: number, out: V3): V3 {
  const sY = Math.sin(yaw), cY = Math.cos(yaw), sT = Math.sin(tilt), cT = Math.cos(tilt);
  const x = (p as any)[off] * cY + (p as any)[off + 2] * sY;
  const z = -(p as any)[off] * sY + (p as any)[off + 2] * cY;
  const y = (p as any)[off + 1];
  out[0] = x; out[1] = y * cT - z * sT; out[2] = y * sT + z * cT;
  return out;
}

export function slerp(a: V3, b: V3, t: number): V3 {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  d = Math.max(-1, Math.min(1, d));
  const th = Math.acos(d);
  if (th < 1e-4) return [a[0], a[1], a[2]];
  const s = Math.sin(th);
  const A = Math.sin((1 - t) * th) / s, B = Math.sin(t * th) / s;
  return [a[0] * A + b[0] * B, a[1] * A + b[1] * B, a[2] * A + b[2] * B];
}

// Raised great-circle arc points between two surface points (the map's look).
export function buildArc(a: V3, b: V3, N = 28, lift = 0.06): Float32Array {
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const p = slerp(a, b, t);
    const h = 1 + lift * Math.sin(Math.PI * t);
    pts[i * 3] = p[0] * h; pts[i * 3 + 1] = p[1] * h; pts[i * 3 + 2] = p[2] * h;
  }
  return pts;
}

const _t: V3 = [0, 0, 0];

export interface GlobeView { cx: number; cy: number; R: number; yaw: number; tilt: number; alpha: number; dense?: boolean; coarse?: boolean; stride?: number; bodyAlpha?: number; }

// Land-dot globe, exactly the shard-map recipe: edge circle + depth-lit 2px
// dots. dense switches to the 0.5-degree grid for close-up camera work, with
// screen culling so the extra points stay cheap.
export function drawGlobe(ctx: CanvasRenderingContext2D, v: GlobeView) {
  if (v.alpha <= 0.01) return;
  // solid sphere body: invisible against the page bg, but it occludes layers
  // rendered beneath the canvas (the hero copy slides under the globe)
  ctx.beginPath();
  ctx.arc(v.cx, v.cy, v.R, 0, Math.PI * 2);
  ctx.fillStyle = BG;
  ctx.fill();
  if (v.bodyAlpha) {
    // lift the ocean above the page bg (small-globe panels read too dark)
    ctx.fillStyle = w(v.bodyAlpha);
    ctx.fill();
  }
  ctx.strokeStyle = w(0.09 * v.alpha);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(v.cx, v.cy, v.R, 0, Math.PI * 2);
  ctx.stroke();
  const L = v.dense ? landDense() : v.coarse ? landCoarse() : land();
  const n = L.length / 3;
  const wpx = ctx.canvas.clientWidth || ctx.canvas.width;
  const hpx = ctx.canvas.clientHeight || ctx.canvas.height;
  const aScale = v.dense ? 0.7 : 1;
  const stride = v.stride ?? 1;
  for (let i = 0; i < n; i += stride) {
    rotv(L, i * 3, v.yaw, v.tilt, _t);
    if (_t[2] <= 0.02) continue;
    const sx = v.cx + _t[0] * v.R, sy = v.cy - _t[1] * v.R;
    if (sx < -8 || sx > wpx + 8 || sy < -8 || sy > hpx + 8) continue;
    const a = (0.06 + 0.34 * _t[2]) * v.alpha * aScale;
    ctx.fillStyle = w(a);
    ctx.fillRect(sx | 0, sy | 0, 2, 2);
  }
}

// Project a surface vector to screen through a view; returns null when on the back.
export function project(vp: V3, v: GlobeView): { x: number; y: number; z: number } | null {
  rotv(vp, 0, v.yaw, v.tilt, _t);
  if (_t[2] <= 0.02) return null;
  return { x: v.cx + _t[0] * v.R, y: v.cy - _t[1] * v.R, z: _t[2] };
}

// Draw a prebuilt arc through a view, with optional progressive reveal + pulse.
export function drawArc(ctx: CanvasRenderingContext2D, pts: Float32Array, v: GlobeView, color: string, reveal = 1, pulseT = -1) {
  if (reveal <= 0.01) return;
  const m = pts.length / 3;
  const upto = Math.max(2, Math.floor(m * clamp01(reveal)));
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  let up = false;
  for (let k = 0; k < upto; k++) {
    rotv(pts, k * 3, v.yaw, v.tilt, _t);
    if (_t[2] > 0) {
      const X = v.cx + _t[0] * v.R, Y = v.cy - _t[1] * v.R;
      if (up) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      up = true;
    } else up = false;
  }
  ctx.stroke();
  if (pulseT >= 0) {
    const idx = Math.floor(clamp01(pulseT) * (upto - 1));
    rotv(pts, idx * 3, v.yaw, v.tilt, _t);
    if (_t[2] > 0) {
      ctx.fillStyle = w(1);
      ctx.fillRect(((v.cx + _t[0] * v.R) | 0) - 1, ((v.cy - _t[1] * v.R) | 0) - 1, 3, 3);
    }
  }
}

export { sph };

// Arm the palette. Last in the file so every binding readTheme() touches is
// initialised; the module only ever evaluates in the browser after <head> has
// stamped data-theme, so the first frame is already the right theme.
if (typeof document !== 'undefined') {
  readTheme();
  new MutationObserver(readTheme).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
}

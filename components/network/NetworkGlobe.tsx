'use client';

// The shard network map's dithered globe, ported from the standalone map page.
// Live only: nodes, rings and every stat come from the orchestrator's
// network.json (proxied same-origin at /network/live.json, polled every 60s).
// The standalone map's simulation fallback and its join ticker are left out on
// purpose, so this page never shows a figure the feed did not report.
import { useEffect, useRef, useState } from 'react';
import { LAND_B64, BORDERS_B64 } from './globe-data';

interface FeedNode {
  id: string; city?: string; cc?: string; lon: number; lat: number; status?: string;
}
interface Feed {
  generatedAt?: string;
  live?: boolean;
  stats?: {
    gpusOnline?: number; countries?: number; throughputTokS?: number;
    tokensServedToday?: number; vramPooledGb?: number;
  };
  nodes?: FeedNode[];
  rings?: { order?: string[] }[];
}

const PI = Math.PI, sin = Math.sin, cos = Math.cos, D2R = PI / 180;

function sph(lon: number, lat: number): [number, number, number] {
  const la = lat * D2R, lo = lon * D2R, cl = cos(la);
  return [cl * sin(lo), sin(la), cl * cos(lo)];
}
function decodeLand(b64: string): Uint8Array {
  const raw = atob(b64), by = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) by[i] = raw.charCodeAt(i);
  const g = new Uint8Array(64800);
  for (let i = 0; i < 64800; i++) g[i] = (by[i >> 3] >> (7 - (i & 7))) & 1;
  return g;
}
function decodeBorders(b64: string): Float32Array[] {
  const raw = atob(b64), by = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) by[i] = raw.charCodeAt(i);
  let p = 0;
  const vu = () => { let s = 0, r = 0, b; do { b = by[p++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); return (r >>> 1) ^ (-(r & 1)); };
  const out: Float32Array[] = [];
  while (p < by.length) {
    const n = vu(), a = new Float32Array(n * 3);
    let px = 0, py = 0;
    for (let k = 0; k < n; k++) { px += vu(); py += vu(); const v = sph(px / 10 - 180, py / 10 - 90); a[k * 3] = v[0]; a[k * 3 + 1] = v[1]; a[k * 3 + 2] = v[2]; }
    out.push(a);
  }
  return out;
}
function slerp(a: number[], b: number[], t: number): number[] {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; d = Math.max(-1, Math.min(1, d));
  const o = Math.acos(d); if (o < 1e-4) return [a[0], a[1], a[2]];
  const s = sin(o), f0 = sin((1 - t) * o) / s, f1 = sin(t * o) / s;
  return [a[0] * f0 + b[0] * f1, a[1] * f0 + b[1] * f1, a[2] * f0 + b[2] * f1];
}
function buildArc(a: number[], b: number[]): Float32Array {
  const N = 28, pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const t = i / (N - 1), p = slerp(a, b, t), lift = 1 + 0.16 * sin(t * PI); pts[i * 3] = p[0] * lift; pts[i * 3 + 1] = p[1] * lift; pts[i * 3 + 2] = p[2] * lift; }
  return pts;
}
const commas = (n: number) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

interface GNode { city: string; v: number[]; serve: boolean; sx: number; sy: number; front: boolean }

/** The network's own live counts (data stats.json), shown while the shard map feed has no nodes. */
export interface NetCounts {
  workersOnline: number; gpu: number; browser: number; image: number;
  jobs?: number; images?: number; at?: string;
}

export default function NetworkGlobe({ net }: { net: NetCounts | null }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [failed, setFailed] = useState(false);
  const sceneRef = useRef<{ nodes: GNode[]; arcs: Float32Array[] }>({ nodes: [], arcs: [] });

  // poll the live feed
  useEffect(() => {
    let alive = true;
    const poll = () => {
      fetch('/network/live.json', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((f: Feed) => { if (alive) { setFeed(f); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // feed -> scene (nodes + ring arcs), exactly as the map's applyFeed builds them
  useEffect(() => {
    if (!feed) return;
    const placed = (feed.nodes || []).filter((f) => typeof f.lat === 'number' && typeof f.lon === 'number');
    const nodes: GNode[] = placed.map((f) => ({ city: f.city || '?', v: sph(f.lon, f.lat), serve: f.status === 'serving', sx: 0, sy: 0, front: false }));
    const byId: Record<string, GNode> = {};
    placed.forEach((f, i) => { byId[f.id] = nodes[i]; });
    const arcs: Float32Array[] = [];
    (feed.rings || []).map((rg) => (rg.order || []).map((id) => byId[id]).filter(Boolean))
      .filter((r) => r.length >= 2)
      .forEach((r) => { for (let i = 0; i < r.length; i++) arcs.push(buildArc(r[i].v, r[(i + 1) % r.length].v)); });
    sceneRef.current = { nodes, arcs };
  }, [feed]);

  // the globe: 1-bit dithered land, borders, ring arcs, nodes; drag to spin
  useEffect(() => {
    const cv = cvRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const LG = decodeLand(LAND_B64), BORDERS = decodeBorders(BORDERS_B64);
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((b) => (b + 0.5) / 16);
    let W = 0, H = 0, CX = 0, CY = 0, R = 0;
    let yaw = -0.5, tilt = 0.28, vel = 0, pulse = 0, last = 0, raf = 0;
    let drag: { x: number; y: number } | null = null;
    const target = { yaw: -0.5, tilt: 0.28, active: false };
    let hovered: GNode | null = null;
    let sY = 0, cY = 1, sT = 0, cT = 1;
    const _t = [0, 0, 0];
    const rot = (p: ArrayLike<number>, out: number[]) => {
      const x = p[0] * cY + p[2] * sY, z = -p[0] * sY + p[2] * cY, y = p[1];
      out[0] = x; out[1] = y * cT - z * sT; out[2] = y * sT + z * cT; return out;
    };
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
      CX = W / 2; CY = H / 2; R = Math.min(W, H) * 0.44;
    };
    const draw = () => {
      const { nodes, arcs } = sceneRef.current;
      ctx.clearRect(0, 0, W, H); sY = sin(yaw); cY = cos(yaw); sT = sin(tilt); cT = cos(tilt);
      ctx.strokeStyle = 'rgba(250,248,246,0.09)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, 2 * PI); ctx.stroke();
      const C = W < 600 ? 4 : 5, S = C - 1;
      const gx0 = Math.floor((CX - R) / C), gx1 = Math.ceil((CX + R) / C), gy0 = Math.floor((CY - R) / C), gy1 = Math.ceil((CY + R) / C);
      ctx.fillStyle = 'rgba(250,248,246,0.62)'; ctx.beginPath();
      for (let gy = gy0; gy < gy1; gy++) {
        const py = -((gy + 0.5) * C - CY) / R;
        for (let gx = gx0; gx < gx1; gx++) {
          const px = ((gx + 0.5) * C - CX) / R, r2 = px * px + py * py; if (r2 >= 1) continue;
          const pz = Math.sqrt(1 - r2), y1 = py * cT + pz * sT, z1 = -py * sT + pz * cT, p0 = px * cY - z1 * sY, p2 = px * sY + z1 * cY;
          let row = Math.floor(90 - Math.asin(Math.max(-1, Math.min(1, y1))) / D2R), col = Math.floor(Math.atan2(p0, p2) / D2R + 180);
          if (row < 0) row = 0; if (row > 179) row = 179; col = (col % 360 + 360) % 360;
          if (!LG[row * 360 + col]) continue;
          if (0.22 + 0.62 * pz <= BAYER[(gy & 3) * 4 + (gx & 3)]) continue;
          ctx.rect(gx * C, gy * C, S, S);
        }
      }
      ctx.fill();
      ctx.strokeStyle = '#0c0a09'; ctx.lineWidth = 1; ctx.beginPath();
      for (const ring of BORDERS) {
        const m = ring.length / 3; let up = false;
        for (let v = 0; v < m; v++) {
          _t[0] = ring[v * 3]; _t[1] = ring[v * 3 + 1]; _t[2] = ring[v * 3 + 2]; rot(_t, _t);
          if (_t[2] > 0.02) { const X = CX + _t[0] * R, Y = CY - _t[1] * R; if (up) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); up = true; } else up = false;
        }
      }
      ctx.stroke();
      for (const pts of arcs) {
        const m2 = pts.length / 3; let up2 = false; ctx.beginPath();
        for (let k = 0; k < m2; k++) {
          _t[0] = pts[k * 3]; _t[1] = pts[k * 3 + 1]; _t[2] = pts[k * 3 + 2]; rot(_t, _t);
          if (_t[2] > 0) { const AX = CX + _t[0] * R, AY = CY - _t[1] * R; if (up2) ctx.lineTo(AX, AY); else ctx.moveTo(AX, AY); up2 = true; } else up2 = false;
        }
        ctx.strokeStyle = '#0c0a09'; ctx.lineWidth = 3; ctx.stroke();
        ctx.strokeStyle = 'rgba(250,248,246,0.9)'; ctx.lineWidth = 1; ctx.stroke();
        const idx = Math.floor((pulse % 1) * (m2 - 1));
        _t[0] = pts[idx * 3]; _t[1] = pts[idx * 3 + 1]; _t[2] = pts[idx * 3 + 2]; rot(_t, _t);
        if (_t[2] > 0) { const QX = (CX + _t[0] * R) | 0, QY = (CY - _t[1] * R) | 0; ctx.fillStyle = '#0c0a09'; ctx.fillRect(QX - 3, QY - 3, 7, 7); ctx.fillStyle = '#faf8f6'; ctx.fillRect(QX - 2, QY - 2, 5, 5); }
      }
      for (const nd of nodes) {
        _t[0] = nd.v[0]; _t[1] = nd.v[1]; _t[2] = nd.v[2]; rot(_t, _t);
        if (_t[2] <= 0.02) { nd.front = false; continue; }
        const nx = CX + _t[0] * R, ny = CY - _t[1] * R, edge = Math.min(1, (_t[2] - 0.02) * 4), ix = nx | 0, iy = ny | 0;
        nd.sx = nx; nd.sy = ny; nd.front = true; const e = edge.toFixed(2);
        if (nd.serve) {
          ctx.fillStyle = `rgba(12,10,9,${e})`; ctx.fillRect(ix - 6, iy - 6, 12, 12);
          ctx.strokeStyle = `rgba(250,248,246,${e})`; ctx.lineWidth = 1; ctx.strokeRect(ix - 4.5, iy - 4.5, 9, 9);
          ctx.fillStyle = `rgba(250,248,246,${e})`; ctx.fillRect(ix - 2, iy - 2, 4, 4);
        } else {
          ctx.fillStyle = `rgba(12,10,9,${e})`; ctx.fillRect(ix - 3, iy - 3, 6, 6);
          ctx.fillStyle = `rgba(250,248,246,${(0.8 * edge).toFixed(2)})`; ctx.fillRect(ix - 2, iy - 2, 4, 4);
        }
        if (nd === hovered) {
          ctx.strokeStyle = 'rgba(250,248,246,0.7)'; ctx.lineWidth = 1; ctx.strokeRect(ix - 6.5, iy - 6.5, 13, 13);
          ctx.font = '500 11px Inter,system-ui,sans-serif'; ctx.textBaseline = 'middle';
          const lbl = nd.city.toLowerCase(); let tx = ix + 11; if (tx + ctx.measureText(lbl).width > W - 4) tx = ix - 11 - ctx.measureText(lbl).width;
          ctx.fillStyle = 'rgba(250,248,246,0.85)'; ctx.fillText(lbl, tx, iy);
        }
      }
    };
    const angLerp = (a: number, b: number, t: number) => { const d = ((b - a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return a + d * t; };
    const frame = (ts: number) => {
      const dt = last ? Math.min(ts - last, 80) : 16; last = ts;
      if (!reduce) {
        if (drag) { /* user in control */ }
        else if (Math.abs(vel) > 0.0003) { yaw += vel; vel *= 0.93; }
        else if (target.active) {
          yaw = angLerp(yaw, target.yaw, 0.05); tilt += (target.tilt - tilt) * 0.05;
          if (Math.abs(angLerp(yaw, target.yaw, 1)) < 0.01 && Math.abs(target.tilt - tilt) < 0.01) target.active = false;
        }
        pulse += dt / 2600;
      }
      draw(); raf = requestAnimationFrame(frame);
    };
    // face the visitor's continent once, from the timezone offset (no lookup)
    const visitor = (): [number, number] => {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
        const lon = Math.max(-180, Math.min(180, (-new Date().getTimezoneOffset() / 60) * 15));
        const lat = ({ Europe: 50, America: 38, Asia: 32, Africa: 6, Australia: -30, Pacific: -8, Atlantic: 38, Indian: -20 } as Record<string, number>)[tz.split('/')[0]];
        return [lon, lat == null ? 30 : lat];
      } catch { return [8, 48]; }
    };
    const xy = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const nodeAt = (mx: number, my: number) => {
      let best: GNode | null = null, bd = 14;
      for (const n of sceneRef.current.nodes) { if (!n.front) continue; const d = Math.abs(n.sx - mx) + Math.abs(n.sy - my); if (d < bd) { bd = d; best = n; } }
      return best;
    };
    const onDown = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; vel = 0; target.active = false; cv.classList.add('drag'); cv.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y, k = 1 / (R || 300);
        yaw += dx * k; tilt = Math.max(-1.2, Math.min(1.2, tilt + dy * k)); vel = dx * k; drag = { x: e.clientX, y: e.clientY };
      } else { const c = xy(e); hovered = nodeAt(c[0], c[1]); cv.style.cursor = hovered ? 'pointer' : ''; }
    };
    const onUp = () => { drag = null; cv.classList.remove('drag'); };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    let rz: ReturnType<typeof setTimeout>;
    const onResize = () => { clearTimeout(rz); rz = setTimeout(layout, 120); };
    window.addEventListener('resize', onResize);
    layout();
    const v = visitor();
    if (reduce) { yaw = -v[0] * D2R; tilt = Math.max(-1, Math.min(1, v[1] * D2R * 0.9)); }
    else { yaw = -v[0] * D2R - 0.55; tilt = 0.18; target.yaw = -v[0] * D2R; target.tilt = Math.max(-1, Math.min(1, v[1] * D2R * 0.9)); target.active = true; }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); clearTimeout(rz);
      window.removeEventListener('resize', onResize);
      cv.removeEventListener('pointerdown', onDown); cv.removeEventListener('pointermove', onMove);
      cv.removeEventListener('pointerup', onUp); cv.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const st = feed?.stats;
  const has = (n: unknown): n is number => typeof n === 'number';
  // The shard map feed only carries numbers while the betanet is live. Until then
  // the hero shows the network's real worker counts, never zeros or simulated nodes.
  const shardLive = feed?.live === true && (feed.nodes?.length ?? 0) > 0;
  if (!shardLive && net) {
    const left = [
      { v: String(net.workersOnline), k: 'workers online' },
      { v: String(net.gpu), k: 'GPU workers' },
    ];
    const right = [
      { v: has(net.jobs) ? commas(net.jobs) : '–', k: 'jobs served' },
      { v: has(net.images) ? commas(net.images) : '–', k: 'images generated' },
      { v: String(net.browser), k: 'browser workers' },
    ];
    const at = net.at ? new Date(net.at) : null;
    return (
      <div className="nw-globe">
        <canvas ref={cvRef} className="nw-globe-cv" aria-label="Globe of the network" />
        <div className="nw-stats nw-stats-l">
          {left.map((s) => (<div key={s.k} className="nw-stat"><div className="v">{s.v}</div><div className="k">{s.k}</div></div>))}
        </div>
        <div className="nw-stats nw-stats-r">
          {right.map((s) => (<div key={s.k} className="nw-stat"><div className="v">{s.v}</div><div className="k">{s.k}</div></div>))}
        </div>
        <div className="nw-feed">{at ? `Updated ${at.toISOString().slice(11, 16)} UTC` : ''}</div>
      </div>
    );
  }
  const left = [
    { v: has(st?.gpusOnline) ? String(st.gpusOnline) : '–', k: 'GPUs online' },
    { v: has(st?.countries) ? String(st.countries) : '–', k: 'countries' },
  ];
  const right = [
    { v: has(st?.throughputTokS) ? String(Math.round(st.throughputTokS)) : '–', u: has(st?.throughputTokS) ? 'tok/s' : '', k: 'network throughput' },
    { v: has(st?.tokensServedToday) ? commas(st.tokensServedToday) : '–', k: 'tokens served today' },
    { v: has(st?.vramPooledGb) ? (st.vramPooledGb / 1000).toFixed(2) : '–', u: has(st?.vramPooledGb) ? 'TB' : '', k: 'GPU memory pooled' },
  ];
  const updated = feed?.generatedAt ? new Date(feed.generatedAt) : null;

  return (
    <div className="nw-globe">
      <canvas ref={cvRef} className="nw-globe-cv" aria-label="Live map of the GPUs in the network" />
      <div className="nw-stats nw-stats-l">
        {left.map((s) => (
          <div key={s.k} className="nw-stat"><div className="v">{s.v}</div><div className="k">{s.k}</div></div>
        ))}
      </div>
      <div className="nw-stats nw-stats-r">
        {right.map((s) => (
          <div key={s.k} className="nw-stat"><div className="v">{s.v}{s.u ? <small> {s.u}</small> : null}</div><div className="k">{s.k}</div></div>
        ))}
      </div>
      <div className="nw-feed">
        {failed && !feed ? 'Live feed unavailable, retrying every minute'
          : updated ? `Feed updated ${updated.toISOString().slice(11, 16)} UTC` : 'Loading live feed'}
      </div>
    </div>
  );
}

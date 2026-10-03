'use client';

// /network's Live section: the network drawn as the triad mark draws it, nodes
// joined by tapered links. One node per worker online, anonymous and placed by
// index, never by location, so nothing on the page says where anyone is. Busy
// workers are solid ink and pulse; idle ones are open. Every figure comes from
// the orchestrator's public counts, polled through /network/live-stats.
import { useEffect, useRef, useState } from 'react';

export interface LiveCounts {
  workersOnline: number;
  byType: { native: number; browser: number; image: number };
  busy: number;
}

const INK = '20,18,16';
const PAPER = '#faf8f6';
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// node radii follow the mark's three nodes (12, 10, 8): GPU, image, browser
const RADIUS = { native: 12, image: 10, browser: 8 } as const;
type Kind = keyof typeof RADIUS;

// deterministic per-index noise, so a node keeps its place as the network grows
function rnd(i: number, salt: number) {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(salt + 7, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Node { x: number; y: number; kind: Kind; busy: boolean; phase: number }

// phyllotaxis: index 0 at the centre, each new worker one step further out
function layout(n: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.sqrt(i + 0.6), a = i * GOLDEN;
    pts.push({ x: r * Math.cos(a) + (rnd(i, 1) - 0.5) * 0.7, y: r * Math.sin(a) + (rnd(i, 2) - 0.5) * 0.7 });
  }
  return pts;
}

// each node links to its nearest earlier node, and to a second one when close,
// so adding a worker only ever adds links at the edge
function links(pts: { x: number; y: number }[]) {
  const out: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const d = pts.slice(0, i).map((p, j) => ({ j, d: Math.hypot(p.x - pts[i].x, p.y - pts[i].y) })).sort((a, b) => a.d - b.d);
    out.push([d[0].j, i]);
    if (d[1] && d[1].d < d[0].d * 1.6) out.push([d[1].j, i]);
  }
  return out;
}

function nodesFor(c: LiveCounts): Node[] {
  const kinds: Kind[] = [
    ...Array(c.byType.native).fill('native'),
    ...Array(c.byType.image).fill('image'),
    ...Array(c.byType.browser).fill('browser'),
  ];
  while (kinds.length < c.workersOnline) kinds.push('browser');
  // a fixed shuffle so types interleave instead of banding by ring
  const order = kinds.map((k, i) => ({ k, s: rnd(i, 9) })).sort((a, b) => a.s - b.s).map((o) => o.k);
  // busy is a count; it lands on the GPU workers first, the lane jobs run on
  let busyLeft = c.busy;
  const busyIdx = new Set<number>();
  order.forEach((k, i) => { if (busyLeft > 0 && k === 'native') { busyIdx.add(i); busyLeft--; } });
  order.forEach((_, i) => { if (busyLeft > 0 && !busyIdx.has(i)) { busyIdx.add(i); busyLeft--; } });
  const pts = layout(order.length);
  return order.map((kind, i) => ({ ...pts[i], kind, busy: busyIdx.has(i), phase: rnd(i, 4) * Math.PI * 2 }));
}

export default function LiveGraph({ initial }: { initial: LiveCounts | null }) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [counts, setCounts] = useState<LiveCounts | null>(initial);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const redraw = useRef<(() => void) | null>(null);

  // poll the orchestrator's public counts
  useEffect(() => {
    let alive = true;
    const poll = () => fetch('/network/live-stats', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((s: LiveCounts) => { if (alive && s && typeof s.workersOnline === 'number') setCounts(s); })
      .catch(() => {});
    poll();
    const id = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const cv = cvRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W = 0, H = 0, dpr = 1, raf = 0, visible = true;

    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    };
    resize();
    const ro = new ResizeObserver(() => { resize(); if (reduce) draw(0); });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduce) loop(); });
    io.observe(cv);

    function draw(t: number) {
      const c = countsRef.current;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, W, H);
      if (!c || c.workersOnline === 0) return;
      const nodes = nodesFor(c), L = links(nodes);
      // fit the spiral into the canvas, at a scale that stays generous for small networks
      const extent = Math.sqrt(nodes.length + 0.6) + 0.8;
      const unit = Math.min(W, H) * 0.46 / extent;
      const k = Math.max(0.55, Math.min(1.15, unit / 40));      // node size follows the spacing
      const cx = W / 2, cy = H / 2;
      const P = nodes.map((n) => ({
        x: cx + n.x * unit + (reduce ? 0 : Math.sin(t / 2400 + n.phase) * 3),
        y: cy + n.y * unit + (reduce ? 0 : Math.cos(t / 2900 + n.phase) * 3),
        r: RADIUS[n.kind] * k, n,
      }));
      // tapered links, the mark's construction (half-width proportional to each end's radius),
      // drawn finer than the mark because these links run much longer
      ctx!.fillStyle = `rgb(${INK})`;
      for (const [a, b] of L) {
        const A = P[a], B = P[b], dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len, wa = A.r * 0.2, wb = B.r * 0.2;
        ctx!.beginPath();
        ctx!.moveTo(A.x + nx * wa, A.y + ny * wa); ctx!.lineTo(B.x + nx * wb, B.y + ny * wb);
        ctx!.lineTo(B.x - nx * wb, B.y - ny * wb); ctx!.lineTo(A.x - nx * wa, A.y - ny * wa);
        ctx!.closePath(); ctx!.fill();
      }
      // nodes: busy solid with a slow pulse ring, idle open on paper
      for (const p of P) {
        if (p.n.busy && !reduce) {
          const ph = ((t / 2200 + p.n.phase) % 1 + 1) % 1;
          ctx!.strokeStyle = `rgba(${INK},${(0.5 * (1 - ph)).toFixed(3)})`; ctx!.lineWidth = 1.5;
          ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r + 4 + ph * 22 * k, 0, Math.PI * 2); ctx!.stroke();
        }
        ctx!.beginPath(); ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        if (p.n.busy) { ctx!.fillStyle = `rgb(${INK})`; ctx!.fill(); }
        else { ctx!.fillStyle = PAPER; ctx!.fill(); ctx!.strokeStyle = `rgb(${INK})`; ctx!.lineWidth = Math.max(1.5, 2 * k); ctx!.stroke(); }
      }
    }

    let last = 0;
    function loop() {
      cancelAnimationFrame(raf);
      const tick = (t: number) => {
        if (!visible) return;
        if (t - last > 33) { draw(t); last = t; }          // 30fps is plenty for a slow drift
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    redraw.current = reduce ? () => draw(0) : null;
    if (reduce) draw(0); else loop();
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, []);

  // under reduced motion nothing animates, so a new count needs one static redraw
  useEffect(() => { redraw.current?.(); }, [counts]);

  const c = counts;
  return (
    <>
      <canvas ref={cvRef} className="nw-graph" aria-label={c ? `${c.workersOnline} workers online, ${c.busy} busy` : 'Workers online'} />
      <div className="nw-live-stats">
        <div className="nw-ls"><div className="v">{c ? c.workersOnline : '–'}</div><div className="k">Workers online</div></div>
        <div className="nw-ls"><div className="v">{c ? c.byType.native : '–'}</div><div className="k">GPU workers</div></div>
        <div className="nw-ls"><div className="v">{c ? c.busy : '–'}</div><div className="k">Busy now</div></div>
      </div>
      <div className="nw-legend-live" aria-hidden="true">
        <span><i className="b" />Busy</span><span><i className="o" />Idle</span>
      </div>
    </>
  );
}

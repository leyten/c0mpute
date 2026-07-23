'use client';

// V3 stage: the right pane of the split-stage shell. A full-height canvas
// draws the flat Europe dot-map (real land dots from land.ts) with the
// six-city ring in the homepage's green-square serving language, and reacts
// to the conversation state:
//   idle      -> dots calm, ring dim with a slow shimmer
//   queued    -> ring warms slightly, a steel request dot circles slowly
//   streaming -> ring lit, token pulses loop the ring
//   complete  -> a brief green settle ripple, then energy decays back to calm
// Below the canvas: a stats block fed ONLY by real fields from
// networkStats / nativeStatus — absent fields are omitted, never invented.
// The ring is the map's serving language for the betanet, not a claim that
// these six cities serve this specific reply; the caption stays honest.

import { useEffect, useRef } from 'react';
import { NetworkStats } from '@/lib/orchestrator/types';
import { w, green, steel } from '@/components/home/scrollstage/art';
import { land } from '@/components/home/scrollstage/land';
import { ChatState } from '../../lib';
import { NativeWorkerStatus } from '../types';

const LON0 = -12, LON1 = 25, LAT0 = 38, LAT1 = 60;
// lon-span * cos(mid-lat) / lat-span, so the flat map isn't stretched
const ASPECT = ((LON1 - LON0) * 0.643) / (LAT1 - LAT0);

// ring order: brussels -> amsterdam -> frankfurt -> prague -> paris -> london
const RING: { name: string; lon: number; lat: number }[] = [
  { name: 'brussels', lon: 4.35, lat: 50.85 },
  { name: 'amsterdam', lon: 4.9, lat: 52.37 },
  { name: 'frankfurt', lon: 8.7, lat: 50.1 },
  { name: 'prague', lon: 14.4, lat: 50.1 },
  { name: 'paris', lon: 2.35, lat: 48.85 },
  { name: 'london', lon: -0.13, lat: 51.5 },
];

let euDots: [number, number][] | null = null;
function eu(): [number, number][] {
  if (!euDots) {
    const L = land();
    euDots = [];
    for (let i = 0; i < L.length; i += 3) {
      const lat = (Math.asin(L[i + 1]) * 180) / Math.PI;
      const lon = (Math.atan2(L[i], L[i + 2]) * 180) / Math.PI;
      if (lon >= LON0 && lon <= LON1 && lat >= LAT0 && lat <= LAT1) euDots.push([lon, lat]);
    }
  }
  return euDots;
}

// Plain (untracked) uppercase so Frankfurt/Prague, which share a latitude,
// stay clear of each other at the stage's minimum width.
function cityLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, alpha: number) {
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = w(alpha);
  ctx.fillText(text.toUpperCase(), x, y);
}

function fmtCount(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function StageCanvas({ chatState, isConnected }: { chatState: ChatState; isConnected: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // The rAF loop reads conversation state through refs so it never restarts.
  const stRef = useRef({ chatState, isConnected });
  const eRef = useRef(0);            // ring energy 0..1, lerped toward target
  const prevRef = useRef<ChatState>(chatState);
  const settleRef = useRef(-1);      // timestamp of the streaming->done beat
  const lastRef = useRef(0);
  const stillRef = useRef(false);
  const drawRef = useRef<((t: number) => void) | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    stillRef.current = still;

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
      const st = stRef.current;
      // streaming just completed -> arm the settle beat (errors settle silently)
      if (prevRef.current === 'streaming' && st.chatState === 'idle') settleRef.current = t;
      prevRef.current = st.chatState;

      const target = !st.isConnected ? 0 : st.chatState === 'streaming' ? 1 : st.chatState === 'queued' ? 0.3 : 0;
      if (still) {
        eRef.current = target;
      } else {
        const dt = Math.min(48, t - (lastRef.current || t));
        lastRef.current = t;
        eRef.current += (target - eRef.current) * Math.min(1, dt * 0.0035);
      }
      const e = eRef.current;

      ctx.clearRect(0, 0, W, H);

      // fit the map box, aspect-true, centered
      let mw = W * 0.9, mh = mw / ASPECT;
      if (mh > H * 0.94) { mh = H * 0.94; mw = mh * ASPECT; }
      const mx = (W - mw) / 2, my = (H - mh) / 2;
      const P = (lon: number, lat: number): [number, number] => [
        mx + ((lon - LON0) / (LON1 - LON0)) * mw,
        my + ((LAT1 - lat) / (LAT1 - LAT0)) * mh,
      ];

      // land dots: 2px squares, hashed alpha, slow idle shimmer
      for (const [lon, lat] of eu()) {
        const [dx, dy] = P(lon, lat);
        const hsh = Math.abs(Math.sin(lon * 12.9 + lat * 7.7));
        let a = 0.24 + 0.22 * hsh;
        if (!still) a += 0.05 * Math.sin(t * 0.0005 + hsh * 6.28);
        ctx.fillStyle = w(a);
        ctx.fillRect(Math.round(dx), Math.round(dy), 2, 2);
      }

      // the six-city ring
      const ringPts = RING.map((c) => P(c.lon, c.lat));
      const dim = st.isConnected ? 1 : 0.55;
      const idleShimmer = still ? 0 : 0.06 * Math.sin(t * 0.0006);
      const ringA = (0.35 + idleShimmer * (1 - e) + 0.5 * e) * dim;
      ctx.strokeStyle = green(ringA);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ringPts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ringPts.forEach(([x, y], i) => {
        ctx.fillStyle = green((0.16 + 0.14 * e) * dim);
        ctx.fillRect((x | 0) - 4, (y | 0) - 4, 8, 8);
        ctx.fillStyle = green((0.5 + 0.5 * e) * dim);
        ctx.fillRect((x | 0) - 2, (y | 0) - 2, 4, 4);
        cityLabel(ctx, RING[i].name, x, y + 7, 0.28 * dim);
      });

      // token pulses loop the ring while serving; a lone steel request dot
      // circles slowly while queued
      if (!still && st.isConnected) {
        if (st.chatState === 'streaming' && e > 0.35) {
          for (let k = 0; k < 2; k++) {
            const pos = (((t % 2200) / 2200) * 6 + k * 3) % 6;
            const i = Math.floor(pos);
            const [x0, y0] = ringPts[i];
            const [x1, y1] = ringPts[(i + 1) % 6];
            const f = pos - i;
            ctx.fillStyle = k === 0 ? '#fff' : green(0.85);
            ctx.fillRect(Math.round(x0 + (x1 - x0) * f) - 1, Math.round(y0 + (y1 - y0) * f) - 1, 3, 3);
          }
        } else if (st.chatState === 'queued') {
          const pos = ((t % 4500) / 4500) * 6;
          const i = Math.floor(pos);
          const [x0, y0] = ringPts[i];
          const [x1, y1] = ringPts[(i + 1) % 6];
          const f = pos - i;
          ctx.fillStyle = steel(0.9);
          ctx.fillRect(Math.round(x0 + (x1 - x0) * f) - 1, Math.round(y0 + (y1 - y0) * f) - 1, 3, 3);
        }
      }

      // settle beat: one expanding green ring from the map's center, fading
      if (!still && settleRef.current >= 0) {
        const p = (t - settleRef.current) / 800;
        if (p >= 1) {
          settleRef.current = -1;
        } else {
          const cx = ringPts.reduce((s, q) => s + q[0], 0) / 6;
          const cy = ringPts.reduce((s, q) => s + q[1], 0) / 6;
          ctx.strokeStyle = green(0.5 * (1 - p));
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, 10 + 55 * p, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      if (!still) raf = requestAnimationFrame(draw);
    };
    drawRef.current = draw;

    if (still) draw(performance.now());
    else raf = requestAnimationFrame(draw);

    const ro = new ResizeObserver(() => {
      layout();
      if (stillRef.current) drawRef.current?.(performance.now());
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      drawRef.current = null;
    };
  }, []);

  // Push state changes into the loop; in reduced motion, repaint the static
  // frame so the ring still reflects idle/queued/streaming.
  useEffect(() => {
    stRef.current = { chatState, isConnected };
    if (stillRef.current) drawRef.current?.(performance.now());
  }, [chatState, isConnected]);

  return <canvas ref={ref} className="w-full h-full" />;
}

interface NetworkStageProps {
  networkStats: NetworkStats | null;
  isConnected: boolean;
  chatState: ChatState;
  nativeStatus: NativeWorkerStatus;
}

export default function NetworkStage({ networkStats, isConnected, chatState, nativeStatus }: NetworkStageProps) {
  const streaming = chatState === 'streaming';
  const tokPerSec = nativeStatus?.online && nativeStatus.tokPerSec > 0 ? nativeStatus.tokPerSec : null;

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* Eyebrow + connection */}
      <div className="shrink-0 px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div>
          <p className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.14em]">the network</p>
          <p className="pixel-sans text-white/30 text-[11px] mt-1">betanet ring · pre-launch</p>
        </div>
        <span className="flex items-center gap-1.5 pt-0.5">
          <span className={`w-1.5 h-1.5 ${isConnected ? 'bg-emerald-400' : 'bg-white/25'}`} />
          <span className={`pixel-sans text-[11px] ${isConnected ? 'text-emerald-300/80' : 'text-white/50'}`}>
            {isConnected ? 'connected' : 'connecting...'}
          </span>
        </span>
      </div>

      {/* The map */}
      <div className="flex-1 min-h-0">
        <StageCanvas chatState={chatState} isConnected={isConnected} />
      </div>

      {/* Real stats only — rows without data are omitted */}
      <div className="shrink-0 border-t border-white/10 px-5 py-4">
        {networkStats && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="pixel-sans text-white/40 text-[11px]">workers online</span>
              <span className="pixel-sans text-white/80 text-[11px] tabular-nums">{networkStats.workersOnline}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="pixel-sans text-white/40 text-[11px]">jobs in queue</span>
              <span className="pixel-sans text-white/80 text-[11px] tabular-nums">{networkStats.jobsInQueue}</span>
            </div>
            {networkStats.tokensGenerated > 0 && (
              <div className="flex items-center justify-between">
                <span className="pixel-sans text-white/40 text-[11px]">tokens served</span>
                <span className="pixel-sans text-white/80 text-[11px] tabular-nums">{fmtCount(networkStats.tokensGenerated)}</span>
              </div>
            )}
          </div>
        )}

        {streaming && (
          <div className={`flex items-center justify-between ${networkStats ? 'mt-3 pt-3 border-t border-white/5' : ''}`}>
            <span className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse" />
              <span className="pixel-sans text-emerald-300/80 text-[11px]">serving your request</span>
            </span>
            {tokPerSec !== null && (
              <span className="pixel-sans text-white/80 text-[11px] tabular-nums">{tokPerSec.toFixed(1)} tok/s</span>
            )}
          </div>
        )}

        <div className={networkStats || streaming ? 'mt-3 pt-3 border-t border-white/5' : ''}>
          <a
            href="https://shard.c0mpute.ai"
            target="_blank"
            rel="noreferrer"
            className="pixel-sans text-[11px] text-white/35 hover:text-[#80a0c1] transition-colors cursor-pointer"
          >
            testbed preview →
          </a>
        </div>
      </div>
    </div>
  );
}

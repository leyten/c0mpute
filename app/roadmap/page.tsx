'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Board geometry ───────────────────────────────────────────────────────────
const RAIL_W = 260;
const COL_W = 350;
const PHASES = ['shipped', 'now', 'next', 'later'] as const;
type Phase = (typeof PHASES)[number];
const PHASE_LABELS: Record<Phase, string> = {
  shipped: 'SHIPPED',
  now: 'NOW',
  next: 'NEXT',
  later: 'LATER',
};
const BOARD_W = RAIL_W + PHASES.length * COL_W + 48;

type Status = 'shipped' | 'progress' | 'planned' | 'milestone';

const STATUS_META: Record<Status, { label: string; dot: string; text: string }> = {
  shipped: { label: 'SHIPPED', dot: 'bg-green-400', text: 'text-green-400' },
  progress: { label: 'IN PROGRESS', dot: 'bg-[#80a0c1]', text: 'text-[#80a0c1]' },
  planned: { label: 'PLANNED', dot: 'bg-white/30', text: 'text-white/40' },
  milestone: { label: 'CRITICAL MILESTONE', dot: 'bg-[#80a0c1]', text: 'text-[#80a0c1]' },
};

interface Item {
  phase: Phase;
  status: Status;
  title: string;
  blurb: string;
}

interface Track {
  name: string;
  tagline: string;
  description: string;
  items: Item[];
}

// Placeholder content — structure only. Real roadmap copy replaces this.
const TRACKS: Track[] = [
  {
    name: 'Network',
    tagline: 'Permissionless GPU supply.',
    description:
      'Placeholder — this section explains the intent, importance and end goal of the Network track: how anyone with a GPU joins, earns, and scales the network. Final copy TBD.',
    items: [
      { phase: 'shipped', status: 'shipped', title: 'Permissionless workers', blurb: 'Anyone can connect a GPU and earn per job, no allowlist.' },
      { phase: 'shipped', status: 'shipped', title: 'Worker payouts', blurb: 'USDC earnings with self-serve withdrawals.' },
      { phase: 'now', status: 'progress', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'next', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'later', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
    ],
  },
  {
    name: 'Protocol',
    tagline: 'shard — verifiable distributed compute.',
    description:
      'Placeholder — this section explains the intent, importance and end goal of the Protocol track: shard, signed receipts, and torrent-style distribution of AI workloads. Final copy TBD.',
    items: [
      { phase: 'shipped', status: 'shipped', title: 'Signed receipts', blurb: 'Every job emits a verifiable, signed receipt.' },
      { phase: 'now', status: 'milestone', title: 'Betanet PoC', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'next', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'next', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'later', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
    ],
  },
  {
    name: 'Token',
    tagline: 'The $ZERO economy.',
    description:
      'Placeholder — this section explains the intent, importance and end goal of the Token track: buyback and burn, staking, and how usage flows back to holders. Final copy TBD.',
    items: [
      { phase: 'shipped', status: 'shipped', title: 'Buyback & burn', blurb: 'Daily on-chain buybacks funded by real usage.' },
      { phase: 'shipped', status: 'shipped', title: 'Self-custody staking', blurb: 'Stake from your own wallet, rewards in USDC.' },
      { phase: 'shipped', status: 'shipped', title: 'Referrals', blurb: 'Share of referred usage, paid in USDC.' },
      { phase: 'now', status: 'progress', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'later', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
    ],
  },
  {
    name: 'Product',
    tagline: 'Uncensored, private inference.',
    description:
      'Placeholder — this section explains the intent, importance and end goal of the Product track: chat, the public API, image generation, and everything users touch. Final copy TBD.',
    items: [
      { phase: 'shipped', status: 'shipped', title: 'Public API', blurb: 'OpenAI-compatible inference API, flat pricing.' },
      { phase: 'shipped', status: 'shipped', title: 'Image generation', blurb: 'Uncensored image gen in chat and via API.' },
      { phase: 'shipped', status: 'shipped', title: 'Data dashboard', blurb: 'Live network stats, aggregates only.' },
      { phase: 'now', status: 'progress', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
      { phase: 'next', status: 'planned', title: 'Placeholder item', blurb: 'Placeholder — final roadmap copy TBD.' },
    ],
  },
];

// ── Pan / zoom board ─────────────────────────────────────────────────────────
function RoadmapBoard() {
  const vpRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const t = useRef({ x: 0, y: 0, s: 1 });
  const fitScale = useRef(0.5);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const dragging = useRef(false);
  const [grabbing, setGrabbing] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  const MAX_SCALE = 2.5;

  const apply = useCallback((animate: boolean) => {
    const el = boardRef.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 450ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none';
    el.style.transform = `translate(${t.current.x}px, ${t.current.y}px) scale(${t.current.s})`;
  }, []);

  const clamp = useCallback(() => {
    const vp = vpRef.current;
    const el = boardRef.current;
    if (!vp || !el) return;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const bw = BOARD_W * t.current.s;
    const bh = el.offsetHeight * t.current.s;
    const padX = vw * 0.3;
    const padY = vh * 0.3;
    const minX = vw - bw - padX;
    const maxX = padX;
    const minY = vh - bh - padY;
    const maxY = padY;
    t.current.x = minX > maxX ? (vw - bw) / 2 : Math.min(maxX, Math.max(minX, t.current.x));
    t.current.y = minY > maxY ? Math.min(24, (vh - bh) / 2) : Math.min(maxY, Math.max(minY, t.current.y));
  }, []);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number, animate: boolean) => {
      const s = t.current.s;
      const ns = Math.min(MAX_SCALE, Math.max(fitScale.current, s * factor));
      if (ns === s) return;
      t.current.x = cx - ((cx - t.current.x) * ns) / s;
      t.current.y = cy - ((cy - t.current.y) * ns) / s;
      t.current.s = ns;
      clamp();
      apply(animate);
    },
    [apply, clamp]
  );

  const reset = useCallback(
    (animate: boolean) => {
      const vp = vpRef.current;
      if (!vp) return;
      const vw = vp.clientWidth;
      fitScale.current = Math.min(1, (vw - 24) / BOARD_W);
      t.current = { x: (vw - BOARD_W * fitScale.current) / 2, y: 16, s: fitScale.current };
      apply(animate);
    },
    [apply]
  );

  useEffect(() => {
    reset(false);
    const onResize = () => reset(false);
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
    };
  }, [reset]);

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setHintVisible(false);
      const rect = vp.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0016), false);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = (e: React.PointerEvent) => {
    const vp = vpRef.current;
    if (!vp) return;
    vp.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
    dragging.current = true;
    setGrabbing(true);
    setHintVisible(false);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !pointers.current.has(e.pointerId)) return;
    const prev = pointers.current.get(e.pointerId)!;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const vp = vpRef.current!;
        const rect = vp.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - rect.left;
        const my = (a.y + b.y) / 2 - rect.top;
        zoomAt(mx, my, d / pinchDist.current, false);
      }
      pinchDist.current = d;
    } else {
      t.current.x += e.clientX - prev.x;
      t.current.y += e.clientY - prev.y;
      clamp();
      apply(false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinchDist.current = 0;
    if (pointers.current.size === 0) {
      dragging.current = false;
      setGrabbing(false);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const vp = vpRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.6, true);
  };

  const zoomCenter = (factor: number) => {
    const vp = vpRef.current;
    if (!vp) return;
    zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, factor, true);
  };

  const toggleFullscreen = () => {
    const vp = vpRef.current;
    if (!vp) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else vp.requestFullscreen().catch(() => {});
  };

  const toolBtn =
    'w-10 h-10 flex items-center justify-center border border-white/10 bg-black/80 backdrop-blur-sm rounded-xl pixel-sans text-white/70 hover:text-white hover:bg-white/10 transition-colors text-lg leading-none';

  return (
    <div
      ref={vpRef}
      className={`relative overflow-hidden border border-white/10 rounded-2xl bg-black h-[70vh] min-h-[480px] select-none touch-none ${
        grabbing ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <div ref={boardRef} className="absolute top-0 left-0 will-change-transform" style={{ width: BOARD_W, transformOrigin: '0 0' }}>
        <div className="p-6">
          {/* Board intro row: title, how-to, legend */}
          <div className="grid gap-4 mb-8" style={{ gridTemplateColumns: `${RAIL_W}px 1fr 1fr` }}>
            <div className="pr-2">
              <h2 className="pixel-serif text-white text-2xl leading-tight">
                The c<span className="pixel-o-small">0</span>mpute roadmap
              </h2>
              <p className="pixel-sans text-white/50 text-xs mt-2">
                What shipped, what we are building now, and where the network goes next. No dates — receipts.
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] rounded-xl p-4">
              <p className="pixel-sans text-white/40 text-[10px] tracking-[0.2em] mb-2">HOW TO VIEW THIS ROADMAP</p>
              <p className="pixel-sans text-white/60 text-xs">
                This is an interactive board. Drag to pan, scroll or pinch to zoom, double-click to zoom in. Use the tools in the corner to
                zoom or go fullscreen.
              </p>
            </div>
            <div className="border border-white/10 bg-white/[0.02] rounded-xl p-4">
              <p className="pixel-sans text-white/40 text-[10px] tracking-[0.2em] mb-2">COMPONENT STATES</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {(Object.keys(STATUS_META) as Status[]).map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 shrink-0 ${STATUS_META[s].dot} ${s === 'milestone' ? 'rotate-45' : 'rounded-full'}`}
                    />
                    <span className="pixel-sans text-white/60 text-[10px] tracking-wider">{STATUS_META[s].label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column headers */}
          <div className="grid" style={{ gridTemplateColumns: `${RAIL_W}px repeat(${PHASES.length}, ${COL_W}px)` }}>
            <div />
            {PHASES.map((p) => (
              <div key={p} className="border-l border-white/10 px-5 pb-4">
                <span className={`pixel-serif text-xl ${p === 'shipped' ? 'text-green-400' : p === 'now' ? 'text-white' : 'text-white/50'}`}>
                  {PHASE_LABELS[p]}
                </span>
              </div>
            ))}
          </div>

          {/* Track swimlanes */}
          {TRACKS.map((track) => (
            <div
              key={track.name}
              className="grid border-t border-white/10"
              style={{ gridTemplateColumns: `${RAIL_W}px repeat(${PHASES.length}, ${COL_W}px)` }}
            >
              <div className="py-6 pr-6">
                <h3 className="pixel-serif text-white text-lg leading-snug">
                  {track.name === 'Token' ? (
                    <>
                      <span className="dollar">$</span>ZERO
                    </>
                  ) : (
                    track.name
                  )}
                </h3>
                <p className="pixel-sans text-white/50 text-xs mt-1.5">
                  {track.tagline.includes('$ZERO') ? (
                    <>
                      The <span className="dollar">$</span>ZERO economy.
                    </>
                  ) : (
                    track.tagline
                  )}
                </p>
              </div>
              {PHASES.map((phase) => (
                <div key={phase} className="border-l border-white/10 p-4 flex flex-col gap-3">
                  {track.items
                    .filter((i) => i.phase === phase)
                    .map((item) => (
                      <div
                        key={item.title + item.blurb}
                        className={`rounded-xl p-4 transition-colors ${
                          item.status === 'milestone'
                            ? 'border border-[#80a0c1]/40 bg-[#80a0c1]/[0.06] hover:bg-[#80a0c1]/[0.12]'
                            : 'border border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={`inline-block w-2 h-2 shrink-0 ${STATUS_META[item.status].dot} ${
                              item.status === 'milestone' ? 'rotate-45' : 'rounded-full'
                            }`}
                          />
                          <span className={`pixel-sans text-[10px] tracking-[0.15em] ${STATUS_META[item.status].text}`}>
                            {STATUS_META[item.status].label}
                          </span>
                        </div>
                        <p className="pixel-serif text-white text-sm">{item.title}</p>
                        <p className="pixel-sans text-white/55 text-xs mt-1.5 leading-relaxed">{item.blurb}</p>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Tools */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-10">
        <button aria-label="Zoom in" className={toolBtn} onClick={() => zoomCenter(1.5)} onPointerDown={(e) => e.stopPropagation()}>
          +
        </button>
        <button aria-label="Zoom out" className={toolBtn} onClick={() => zoomCenter(1 / 1.5)} onPointerDown={(e) => e.stopPropagation()}>
          −
        </button>
        <button aria-label="Reset view" className={toolBtn} onClick={() => reset(true)} onPointerDown={(e) => e.stopPropagation()}>
          <span className="text-xs">FIT</span>
        </button>
        <button aria-label="Fullscreen" className={toolBtn} onClick={toggleFullscreen} onPointerDown={(e) => e.stopPropagation()}>
          <span className="text-xs">⛶</span>
        </button>
      </div>

      {/* Interaction hint */}
      <div
        className={`absolute bottom-4 left-4 pointer-events-none transition-opacity duration-700 ${
          hintVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="pixel-sans text-white/40 text-xs border border-white/10 bg-black/80 backdrop-blur-sm rounded-xl px-3 py-2 inline-block">
          drag to pan · scroll to zoom
        </span>
      </div>
    </div>
  );
}

// ── Tracks detail section ────────────────────────────────────────────────────
function TrackDetails() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {TRACKS.map((track, i) => (
        <div key={track.name} className="border border-white/10 bg-white/[0.02] rounded-2xl p-6 hover:bg-white/[0.04] transition-colors">
          <h3 className="pixel-serif text-white text-xl">
            {track.name === 'Token' ? (
              <>
                <span className="dollar">$</span>ZERO
              </>
            ) : (
              track.name
            )}
          </h3>
          <p className="pixel-sans text-white/60 text-sm mt-2">
            {track.tagline.includes('$ZERO') ? (
              <>
                The <span className="dollar">$</span>ZERO economy.
              </>
            ) : (
              track.tagline
            )}
          </p>
          <div
            className="overflow-hidden transition-[max-height] duration-500 ease-in-out"
            style={{ maxHeight: open === i ? 320 : 0 }}
          >
            <p className="pixel-sans text-white/55 text-sm mt-4 leading-relaxed">{track.description}</p>
          </div>
          <button
            className="pixel-sans text-[#80a0c1] text-sm mt-4 hover:text-white transition-colors cursor-pointer"
            onClick={() => setOpen(open === i ? null : i)}
          >
            {open === i ? 'Read less' : 'Read more'}
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function RoadmapPage() {
  return (
    <div className="min-h-screen bg-black">
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex-1">
              <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                C
                <span
                  className="pixel-serif-logo"
                  style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}
                >
                  0
                </span>
                MPUTE
              </a>
            </div>
            <div className="flex items-center gap-4">
              <a href="/" className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors">
                ← Back
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-16 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="pixel-serif text-white text-4xl md:text-5xl mb-3">Roadmap</h1>
          <p className="pixel-sans text-white/70 text-sm mb-8 max-w-2xl">
            Where c0mpute is going — and, unlike most roadmaps, what is already live. Everything in the SHIPPED column is running in
            production today, verifiable on-chain or in the open repos.
          </p>

          <RoadmapBoard />

          <p className="pixel-sans text-white/35 text-xs mt-4 max-w-3xl">
            This roadmap reflects current direction, not a promise of dates. Items move as the network and its priorities evolve.
          </p>

          <section className="mt-16 pt-12 border-t border-white/5">
            <h2 className="pixel-serif text-white text-2xl md:text-3xl mb-3">Roadmap tracks</h2>
            <p className="pixel-sans text-white/60 text-sm mb-8 max-w-2xl">
              The intent, importance and end goal of each track on the board.
            </p>
            <TrackDetails />
          </section>
        </div>
      </main>
    </div>
  );
}

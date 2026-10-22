'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadName, fmtClock, fmtDuration, type ShownVideo } from './lib';
import {
  IconChevron, IconCopy, IconDownload, IconEdit, IconExpand, IconLoop, IconMuted, IconPause, IconPlay, IconRedo, IconTrash, IconVolume, IconX,
} from './icons';

// The lightbox. Always on a dark ground whatever the theme: it is a screening
// room, and a clip reads best on black. Custom controls, keyboard first.
export function Viewer({ clips, index, onIndex, onClose, onReuse, onRegenerate, onDelete }: {
  clips: ShownVideo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onReuse: (c: ShownVideo) => void;
  onRegenerate: (c: ShownVideo) => void;
  onDelete: (c: ShownVideo) => void;
}) {
  const clip = clips[index];
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [loop, setLoop] = useState(true);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  // Both belong to one clip: whenever the clip on screen changes, by browsing
  // or by a new render landing, an armed delete or an expanded prompt is gone.
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [moreFor, setMoreFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const go = useCallback((d: number) => {
    if (clips.length < 2) return;
    onIndex((index + d + clips.length) % clips.length);
  }, [clips.length, index, onIndex]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  }, []);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else stageRef.current?.requestFullscreen().catch(() => {});
  }, []);

  // React does not reliably reflect a changed `muted` prop onto the element.
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, clip?.id]);

  // Focus moves into the viewer when it opens (the page returns it to the
  // tile on close), so nothing behind the dialog hears the keys.
  useEffect(() => { rootRef.current?.focus(); }, []);

  // Shortcuts listen in the capture phase, so they win over whatever is
  // focused inside: Space plays and pauses even on the scrubber or a button,
  // and the arrows browse clips instead of nudging the scrubber.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (e.key === 'Tab') {
        const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => el.getClientRects().length > 0);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        const at = document.activeElement;
        if (!root.contains(at) || (e.shiftKey && (at === first || at === root)) || (!e.shiftKey && at === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
        return;
      }
      const handled = (fn: () => void) => { e.preventDefault(); e.stopPropagation(); fn(); };
      if (e.key === 'Escape') { if (!document.fullscreenElement) handled(onClose); }
      else if (e.key === ' ') handled(togglePlay);
      else if (e.key === 'm' || e.key === 'M') handled(() => setMuted((m) => !m));
      else if (e.key === 'f' || e.key === 'F') handled(toggleFullscreen);
      else if (e.key === 'ArrowLeft') handled(() => go(-1));
      else if (e.key === 'ArrowRight') handled(() => go(1));
    };
    // A focused button would otherwise also "click" on Space's keyup.
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === ' ') e.preventDefault(); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose, togglePlay, toggleFullscreen]);

  if (!clip) return null;

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1400); } catch {}
  };
  const fill = dur ? `${(t / dur) * 100}%` : '0%';
  const confirmDelete = confirmFor === clip.id;
  const longPrompt = clip.prompt.length > 240;
  const showAll = moreFor === clip.id;
  const ctl = 'grid h-9 w-9 cursor-pointer place-items-center text-white/75 transition-colors hover:text-white';
  const act = 'pixel-sans flex w-full cursor-pointer items-center gap-2.5 border border-white/15 px-3.5 py-2.5 text-[13px] text-white/85 transition-colors hover:border-white/40 hover:text-white';

  return (
    // A <section>, not a <div>: globals.css stretches every button inside a
    // div[role="dialog"] to full width for Privy's login modal.
    <section ref={rootRef} tabIndex={-1} className="fixed inset-0 z-[120] flex flex-col bg-[#0b0a09] text-white outline-none lg:flex-row" role="dialog" aria-modal="true" aria-label="Clip viewer">
      {/* stage */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 flex-col bg-[#0b0a09]">
        <div className="flex shrink-0 items-center justify-between px-3 py-2 lg:px-5 lg:py-3">
          <button type="button" onClick={onClose} aria-label="Close viewer" className={ctl}><IconX /></button>
          <div className="flex items-center gap-1">
            {clips.length > 1 && <button type="button" onClick={() => go(-1)} aria-label="Previous clip" className={`${ctl} lg:hidden`}><IconChevron dir="left" /></button>}
            <span className="pixel-sans min-w-[3.5rem] text-center text-[12px] tabular-nums text-white/50">{index + 1} / {clips.length}</span>
            {clips.length > 1 && <button type="button" onClick={() => go(1)} aria-label="Next clip" className={`${ctl} lg:hidden`}><IconChevron dir="right" /></button>}
          </div>
          <span className="w-9" aria-hidden="true" />
        </div>

        {/* swipe left or right to browse on touch screens */}
        <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 lg:px-16"
          onTouchStart={(e) => { const t0 = e.touches[0]; touchRef.current = { x: t0.clientX, y: t0.clientY }; }}
          onTouchEnd={(e) => {
            const s = touchRef.current; touchRef.current = null;
            const t1 = e.changedTouches[0];
            if (!s || !t1) return;
            const dx = t1.clientX - s.x, dy = t1.clientY - s.y;
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
          }}>
          <video
            key={clip.id}
            ref={videoRef}
            src={clip.url}
            autoPlay
            muted={muted}
            loop={loop}
            playsInline
            onClick={togglePlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => { setDur(e.currentTarget.duration || 0); setT(0); }}
            className="block h-full max-h-full w-full max-w-full cursor-pointer object-contain"
          />
          {clips.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous clip"
                className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center border border-white/15 text-white/70 hover:border-white/40 hover:text-white lg:grid">
                <IconChevron dir="left" />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Next clip"
                className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center border border-white/15 text-white/70 hover:border-white/40 hover:text-white lg:grid">
                <IconChevron dir="right" />
              </button>
            </>
          )}
        </div>

        {/* controls */}
        <div className="flex shrink-0 items-center gap-1 px-3 pb-3 pt-2 lg:gap-2 lg:px-6 lg:pb-5">
          <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'} className={ctl}>
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <span className="pixel-sans w-[76px] shrink-0 text-center text-[12px] tabular-nums text-white/60">{fmtClock(t * 1000)} / {fmtClock(dur * 1000)}</span>
          <input type="range" min={0} max={dur || 0} step={0.01} value={Math.min(t, dur || 0)} aria-label="Seek"
            onChange={(e) => { const v = videoRef.current; if (v) { v.currentTime = Number(e.target.value); setT(v.currentTime); } }}
            className="st-range min-w-0 flex-1" style={{ ['--st-fill' as string]: fill }} />
          <button type="button" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'} className={ctl}>
            {muted ? <IconMuted /> : <IconVolume />}
          </button>
          <button type="button" onClick={() => setLoop((l) => !l)} aria-pressed={loop} aria-label="Loop" className={`${ctl} ${loop ? '!text-white' : '!text-white/35'}`}>
            <IconLoop />
          </button>
          <button type="button" onClick={toggleFullscreen} aria-label="Fullscreen" className={ctl}><IconExpand /></button>
        </div>
      </div>

      {/* details */}
      <aside className="max-h-[42dvh] shrink-0 overflow-y-auto border-t border-white/10 px-5 py-5 lg:max-h-none lg:w-[360px] lg:border-l lg:border-t-0 lg:px-7 lg:py-7">
        <div className="flex items-center justify-between">
          <p className="pixel-sans text-[11px] uppercase tracking-[0.08em] text-white/45">Prompt</p>
          <button type="button" onClick={() => copy('prompt', clip.prompt)} className="pixel-sans flex cursor-pointer items-center gap-1.5 text-[12px] text-white/55 hover:text-white">
            <IconCopy size={13} /> {copied === 'prompt' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className={`pixel-sans mt-2.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/90 ${longPrompt && !showAll ? 'line-clamp-6' : ''}`}>{clip.prompt}</p>
        {longPrompt && (
          <button type="button" onClick={() => setMoreFor(showAll ? null : clip.id)} className="pixel-sans mt-1.5 cursor-pointer text-[12px] text-white/55 underline underline-offset-2 hover:text-white">
            {showAll ? 'Show less' : 'Show more'}
          </button>
        )}

        <dl className="pixel-sans mt-6 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/10 pt-5 text-[13px]">
          <div><dt className="text-white/45">Size</dt><dd className="tabular-nums text-white/85">{clip.width} x {clip.height}</dd></div>
          <div><dt className="text-white/45">Length</dt><dd className="tabular-nums text-white/85">{dur ? `${dur.toFixed(1)}s` : '5s'}</dd></div>
          <div>
            <dt className="text-white/45">Seed</dt>
            <dd className="tabular-nums text-white/85">
              {clip.seed ? (
                <button type="button" onClick={() => copy('seed', String(clip.seed))} className="flex cursor-pointer items-center gap-1.5 hover:text-white" title="Copy seed">
                  {clip.seed} <IconCopy size={12} />{copied === 'seed' && <span className="text-white/50">Copied</span>}
                </button>
              ) : 'Unknown'}
            </dd>
          </div>
          <div><dt className="text-white/45">Made</dt><dd className="text-white/85">{new Date(clip.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{clip.renderMs ? `, in ${fmtDuration(clip.renderMs)}` : ''}</dd></div>
          {clip.adult && <div className="col-span-2"><span className="border border-white/25 px-1.5 text-[11px] leading-5 text-white/75">18+</span></div>}
        </dl>

        <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-5">
          <a href={clip.url} download={downloadName(clip)}
            className="pixel-sans flex w-full items-center justify-between bg-white px-3.5 py-2.5 text-[13px] text-black hover:bg-white/90">
            <span className="flex items-center gap-2.5"><IconDownload size={14} /> Download</span>
            <span className="text-black/50">MP4</span>
          </a>
          <button type="button" onClick={() => onReuse(clip)} className={act}><IconEdit size={14} /> Reuse prompt</button>
          <button type="button" onClick={() => onRegenerate(clip)} className={act}><IconRedo size={14} /> Regenerate with a new seed</button>
          {confirmDelete ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => { setConfirmFor(null); onDelete(clip); }}
                className="pixel-sans flex-1 cursor-pointer bg-[#b42318] px-3 py-2.5 text-[13px] text-white hover:opacity-90">Delete clip</button>
              <button type="button" onClick={() => setConfirmFor(null)}
                className="pixel-sans flex-1 cursor-pointer border border-white/15 px-3 py-2.5 text-[13px] text-white/80 hover:border-white/40">Keep it</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmFor(clip.id)} className={`${act} hover:!border-[#f87171]/60 hover:!text-[#fca5a5]`}><IconTrash size={14} /> Delete</button>
          )}
          <p className="pixel-sans mt-1 text-[11px] text-white/35">Space play, M mute, F fullscreen, arrows to browse, Esc to close</p>
        </div>
      </aside>
    </section>
  );
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ASPECTS, SUGGESTED_PROMPTS, VIDEO_CREDITS, type AspectId } from './lib';
import { IconChevron, IconDice, IconX } from './icons';

export interface ComposerProps {
  prompt: string;
  onPrompt: (v: string) => void;
  aspect: AspectId;
  onAspect: (v: AspectId) => void;
  adult: boolean;
  onToggleAdult: () => void;
  seed: string;
  onSeed: (v: string) => void;
  onGenerate: () => void;
  // Why Generate is off, in the user's words; null when it can be pressed.
  blocked: { reason: string; href?: string; cta?: string } | null;
  submitting: boolean;
  activeCount: number;
  isAuthenticated: boolean;
  balance: number | null;
  grantLeft: number;
  expectedMs: number;
  error: string | null;
  // The collapsed sheet's height on small screens, so the canvas can keep
  // its last row clear of it.
  onSheetHeight: (h: number) => void;
}

// The left panel on desktop, a bottom sheet on mobile. One tree for both: on
// small screens everything but the prompt and the Generate bar folds away
// until the sheet is expanded.
export default function Composer(p: ComposerProps) {
  const [expanded, setExpandedState] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [moreBelow, setMoreBelow] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const seedRef = useRef<HTMLInputElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Read by the resize observer, which can fire before an effect would have
  // caught up, so it is set together with the state.
  const expandedRef = useRef(false);
  const setExpanded = (v: boolean) => { expandedRef.current = v; setExpandedState(v); };
  const { onSheetHeight } = p;

  useEffect(() => {
    const el = asideRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { if (!expandedRef.current) onSheetHeight(el.getBoundingClientRect().height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [onSheetHeight]);

  // A fade at the bottom of the settings says there is more below the fold.
  const checkMore = () => {
    const el = scrollRef.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(checkMore);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-grow: the box follows its content between its CSS min and max.
  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [p.prompt]);

  // what folds away in the collapsed sheet (flex rows need their own display)
  const sheet = expanded ? '' : 'hidden lg:block';
  const sheetFlex = expanded ? 'flex' : 'hidden lg:flex';
  const minutes = Math.max(0.5, Math.round((p.expectedMs / 60_000) * 2) / 2);
  const canPress = !p.blocked && !p.submitting;
  const label = !p.isAuthenticated ? 'Log in to generate' : p.submitting ? 'Starting' : 'Generate';

  return (
    <>
    {/* tapping outside the open sheet closes it (mobile only) */}
    {expanded && <div className="fixed inset-0 z-30 bg-scrim lg:hidden" onClick={() => setExpanded(false)} aria-hidden="true" />}
    <aside
      ref={asideRef}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[88dvh] flex-col border-t border-fg/15 bg-background shadow-[0_-12px_40px_-20px_rgba(0,0,0,0.35)]
        lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-[380px] lg:shrink-0 lg:border-r lg:border-t-0 lg:border-fg/10 lg:shadow-none"
      aria-label="Composer"
    >
      {/* the sheet's handle (mobile only) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="flex shrink-0 cursor-pointer items-center justify-between px-5 pb-1 pt-2.5 lg:hidden"
      >
        <span className="st-eyebrow">{expanded ? 'Hide settings' : 'Settings'}</span>
        <span className="mx-auto h-1 w-10 rounded-full bg-fg/20" aria-hidden="true" />
        <IconChevron dir={expanded ? 'down' : 'up'} className="text-fg-50" />
      </button>

      <div ref={scrollRef} onScroll={checkMore} className="relative min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4 pt-2 lg:space-y-4 lg:px-6 lg:pt-5">
        {/* Model */}
        <section className={sheet}>
          <div className="border border-fg/12 p-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="pixel-serif text-[22px] text-fg">Wan 2.2</h2>
              <span className="st-eyebrow">Text to video</span>
            </div>
            <p className="pixel-sans mt-1 text-[13px] leading-snug text-fg-55">14B, uncensored, rendered on the network</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {['5s', '720p', `~${minutes} min`, 'Private'].map((c) => (
                <span key={c} className="pixel-sans border border-fg/15 px-2 py-0.5 text-[12px] leading-5 text-fg-70">{c}</span>
              ))}
              <span className="pixel-sans ml-auto text-[11px] text-fg-40">More models soon</span>
            </div>
          </div>
        </section>

        {/* Prompt */}
        <section>
          <label htmlFor="st-prompt" className={`st-eyebrow mb-2 ${sheet}`}>Prompt</label>
          <div className="border border-fg/15 bg-raise focus-within:border-fg/50">
            <textarea
              id="st-prompt"
              ref={taRef}
              value={p.prompt}
              onChange={(e) => p.onPrompt(e.target.value)}
              onKeyDown={(e) => {
                // not while an IME is composing (Enter there picks a candidate)
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                if (canPress) p.onGenerate();
              }}
              placeholder="A lighthouse on a cliff at dusk, waves crashing below, slow aerial push in"
              maxLength={2000}
              rows={2}
              className="pixel-sans block max-h-[15.5em] min-h-[3.4em] w-full resize-none overflow-y-auto bg-transparent px-3.5 py-3 text-[15px] leading-[1.5] text-fg placeholder-fg-35 focus:outline-none lg:min-h-[7.1em]"
            />
            <div className={`items-center justify-between border-t border-fg/8 px-3.5 py-1.5 ${sheetFlex}`}>
              <span className="pixel-sans text-[11px] text-fg-35">Enter to generate</span>
              <span className="pixel-sans text-[11px] tabular-nums text-fg-35">{p.prompt.length}/2000</span>
            </div>
          </div>
          {!p.prompt.trim() && (
            <div className={`mt-3 flex-wrap items-center gap-1.5 ${sheetFlex}`}>
              <span className="pixel-sans mr-1 text-[12px] text-fg-45">Try</span>
              {SUGGESTED_PROMPTS.map((s) => (
                <button key={s.label} type="button" onClick={() => { p.onPrompt(s.prompt); taRef.current?.focus(); }} title={s.prompt}
                  className="pixel-sans cursor-pointer border border-fg/12 px-2.5 py-1 text-[12px] text-fg-70 transition-colors hover:border-fg/40 hover:text-fg">
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Aspect */}
        <section className={sheet}>
          <p className="st-eyebrow mb-2">Aspect</p>
          <div className="grid grid-cols-3 gap-2">
            {ASPECTS.map((a) => {
              const on = p.aspect === a.id;
              const fw = a.w > a.h ? 30 : a.w < a.h ? 17 : 24;
              const fh = a.w > a.h ? 17 : a.w < a.h ? 30 : 24;
              return (
                <button key={a.id} type="button" onClick={() => p.onAspect(a.id)} aria-pressed={on}
                  className={`flex min-w-0 cursor-pointer items-center gap-2 border px-2 py-2 text-left transition-colors ${
                    on ? 'border-fg bg-fg/[0.05] text-fg' : 'border-fg/12 text-fg-55 hover:border-fg/35 hover:text-fg'
                  }`}>
                  <span className="grid h-7 w-5 shrink-0 place-items-center" aria-hidden="true">
                    <span style={{ width: fw * 0.66, height: fh * 0.66 }} className={`block border-[1.5px] ${on ? 'border-fg' : 'border-current'}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="pixel-sans block text-[12px] leading-tight">{a.label}</span>
                    <span className="pixel-sans block text-[11px] leading-tight tabular-nums text-fg-40">{a.ratio}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Duration + input */}
        <section className={sheet}>
          <p className="st-eyebrow mb-2">Duration</p>
          <div className="flex gap-2">
            {[{ v: '3s', on: false }, { v: '5s', on: true }, { v: '10s', on: false }].map((d) => (
              <span key={d.v} aria-disabled={!d.on}
                className={`pixel-sans flex flex-1 items-center justify-center gap-1.5 border py-1.5 text-[13px] ${
                  d.on ? 'border-fg bg-fg/[0.05] text-fg' : 'cursor-not-allowed border-fg/10 text-fg-30'
                }`}>
                {d.v}{!d.on && <span className="text-[10px] uppercase tracking-[0.08em]">Soon</span>}
              </span>
            ))}
          </div>
          <div className="pixel-sans mt-2 flex cursor-not-allowed items-center justify-between border border-dashed border-fg/12 px-3 py-1.5 text-[13px] text-fg-35" aria-disabled="true">
            <span>Image to video</span>
            <span className="text-[10px] uppercase tracking-[0.08em]">Soon</span>
          </div>
        </section>

        {/* 18+ */}
        <section className={sheet}>
          <div className="flex items-start justify-between gap-4 border-t border-fg/10 pt-4">
            <div>
              <p className="pixel-sans text-[14px] text-fg">18+ content</p>
              <p className="pixel-sans mt-0.5 text-[12px] leading-snug text-fg-45">Allows adult content. Sexual content involving minors is never generated.</p>
            </div>
            <button type="button" role="switch" aria-checked={p.adult} aria-label="18+ content" onClick={p.onToggleAdult}
              className={`relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors ${p.adult ? 'border-fg bg-fg' : 'border-fg/25 bg-fg/[0.06]'}`}>
              <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all ${p.adult ? 'left-[22px] bg-[var(--on-fg)]' : 'left-0.5 bg-fg/45'}`} />
            </button>
          </div>
        </section>

        {/* Advanced */}
        <section className={sheet}>
          <button type="button" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}
            className="pixel-sans flex w-full cursor-pointer items-center justify-between border-t border-fg/10 pt-4 text-[14px] text-fg-70 hover:text-fg">
            Advanced <IconChevron dir={showAdvanced ? 'up' : 'down'} />
          </button>
          {showAdvanced && (
            <div className="mt-3">
              <label htmlFor="st-seed" className="pixel-sans mb-1.5 block text-[12px] text-fg-50">Seed</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input id="st-seed" ref={seedRef} value={p.seed} inputMode="numeric" placeholder="Random each time"
                    onChange={(e) => p.onSeed(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                    className="pixel-sans w-full border border-fg/15 bg-raise px-3 py-2 text-[14px] tabular-nums text-fg placeholder-fg-35 focus:border-fg/50 focus:outline-none" />
                  {p.seed && (
                    <button type="button" onClick={() => { p.onSeed(''); seedRef.current?.focus(); }} aria-label="Back to a random seed"
                      className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1 text-fg-40 hover:text-fg"><IconX size={12} /></button>
                  )}
                </div>
                <button type="button" onClick={() => p.onSeed(String(1 + Math.floor(Math.random() * 2_147_483_646)))} aria-label="Pick a random seed"
                  className="grid w-10 cursor-pointer place-items-center border border-fg/15 text-fg-60 hover:border-fg/40 hover:text-fg"><IconDice /></button>
              </div>
              <p className="pixel-sans mt-1.5 text-[12px] text-fg-40">The same prompt and seed give the same clip.</p>
            </div>
          )}
        </section>
        {moreBelow && (
          <div className="pointer-events-none sticky -bottom-4 -mx-5 -mt-12 h-12 bg-gradient-to-t from-background to-transparent lg:-mx-6" aria-hidden="true" />
        )}
      </div>

      {/* Generate */}
      <div className="shrink-0 border-t border-fg/10 bg-background px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 lg:px-6">
        <button type="button" onClick={p.onGenerate} disabled={!canPress}
          className="flex h-12 w-full cursor-pointer items-center justify-between bg-fg px-4 text-on-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35">
          <span className="pixel-serif text-[16px]">{label}</span>
          <span className="pixel-sans text-[13px] tabular-nums opacity-75">{VIDEO_CREDITS} credits</span>
        </button>
        {p.blocked ? (
          <p className="pixel-sans mt-2 text-[12px] text-fg-55">
            {p.blocked.reason}
            {p.blocked.href && <> <a href={p.blocked.href} className="text-fg underline underline-offset-2">{p.blocked.cta}</a></>}
          </p>
        ) : p.error ? (
          <p role="alert" className="pixel-sans mt-2 text-[12px] text-danger">{p.error}</p>
        ) : (
          <p className="pixel-sans mt-2 text-[12px] tabular-nums text-fg-45">
            {/* the same two pools the Generate check counts: credits, then today's grant */}
            {p.isAuthenticated && p.balance !== null ? `${p.balance.toLocaleString()} credits · ` : ''}
            {p.isAuthenticated && p.grantLeft > 0 ? `${p.grantLeft.toLocaleString()} left in today's grant · ` : ''}~{minutes} min per clip
            {p.activeCount > 0 ? ` · ${p.activeCount} of 2 rendering` : ''}
          </p>
        )}
      </div>
    </aside>
    </>
  );
}

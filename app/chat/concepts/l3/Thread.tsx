'use client';

// The thread: a slim header, the messages, and the floating composer. The
// stream renders through the same markdown path as saved messages. Scrolling
// follows the stream only while the reader is at the bottom; otherwise a
// jump pill offers the way down instead of yanking them there.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';
import type { Plan, PlanId } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import type { Convo, LiveJob } from './store';
import MessageView, { LiveBlock } from './MessageView';
import Composer from './Composer';
import { Wordmark } from './Sidebar';
import { IconChevronDown, IconPanel, IconPlus } from './Icons';

const STARTERS = [
  'Explain speculative decoding, with sources',
  'Show me the attention math',
  'Write a Python client for the API',
];

export default function Thread({ engine, convo, plan, think, live, error, canRetry, pendingImageMsgId, anonBlocked, sideOpen, draftKey, draftsRef, onToggleSide, onOpenDrawer, onNew, onSend, onRetry, onStop, onDismissError, onSelectModel, onToggleThink }: {
  engine: ChatEngine;
  convo: Convo | null;
  plan: Plan;
  think: boolean;
  live: LiveJob | null;
  error: string | null;
  canRetry: boolean;
  pendingImageMsgId: string | null;
  anonBlocked: boolean;
  sideOpen: boolean;
  draftKey: string;
  draftsRef: { current: Record<string, string> };
  onToggleSide: () => void;
  onOpenDrawer: () => void;
  onNew: () => void;
  onSend: (text: string, images: string[]) => boolean;
  onRetry: () => void;
  onStop: () => void;
  onDismissError: () => void;
  onSelectModel: (id: PlanId) => void;
  onToggleThink: () => void;
}) {
  const liveHere = live !== null && convo !== null && live.convoId === convo.id;
  const liveElsewhere = live !== null && !liveHere;
  const empty = !convo || convo.messages.length === 0;

  // Pin-to-bottom scrolling: follow the stream only while the reader is at
  // the bottom; otherwise show the jump pill instead of stealing the scroll.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  // True while a smooth jump glides down: scroll events during the glide stay
  // pinned and keep the pill hidden instead of flickering it back in. Reader
  // input (wheel, touch) interrupts the glide and hands control straight back.
  const glideRef = useRef(false);
  const reducedRef = useRef(false);
  const [showJump, setShowJump] = useState(false);
  // A conversation switch re-pins to the bottom; adjust during render so the
  // stale jump pill never paints (the scroll itself happens in the effect).
  const [prevConvoId, setPrevConvoId] = useState(convo?.id);
  if (prevConvoId !== convo?.id) {
    setPrevConvoId(convo?.id);
    if (showJump) setShowJump(false);
  }
  useEffect(() => {
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (reducedRef.current) {
      el.scrollTop = el.scrollHeight;
    } else {
      glideRef.current = true;
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    pinnedRef.current = true;
    setShowJump(false);
  }, []);
  const cancelGlide = useCallback(() => { glideRef.current = false; }, []);
  useEffect(() => {
    pinnedRef.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [convo?.id]);
  useEffect(() => {
    if (pinnedRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [live?.text, live?.status, live?.genImage, convo?.messages.length, error]);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (glideRef.current) {
      if (pinned) glideRef.current = false;
      pinnedRef.current = true;
      setShowJump(false);
      return;
    }
    pinnedRef.current = pinned;
    setShowJump(!pinned && el.scrollHeight > el.clientHeight + 200);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="shrink-0 border-b border-white/[0.07]">
        <div className="h-14 px-2.5 md:px-4 flex items-center gap-2">
          <button
            onClick={onToggleSide}
            title={sideOpen ? 'hide conversations' : 'show conversations'}
            aria-label={sideOpen ? 'hide conversations' : 'show conversations'}
            className="l3-press cursor-pointer hidden md:flex p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05]"
          >
            <IconPanel className="w-[18px] h-[18px]" />
          </button>
          <button
            onClick={onOpenDrawer}
            title="conversations"
            aria-label="open conversations"
            className="l3-press cursor-pointer md:hidden p-2 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05]"
          >
            <IconPanel className="w-[18px] h-[18px]" />
          </button>

          <div className="flex-1 min-w-0 flex items-center">
            {convo ? (
              <span className="pixel-sans text-[13.5px] text-white/75 truncate">{convo.title}</span>
            ) : (
              <div className={sideOpen ? 'md:hidden' : ''}>
                <Wordmark />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 md:gap-3 shrink-0">
            {engine.live ? (
              <span className="hidden sm:flex items-center gap-2">
                <StatusBadge state="live" />
                <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40">
                  {engine.stats?.workersOnline ?? 0} workers
                </span>
              </span>
            ) : engine.demo ? (
              <span className="hidden sm:block pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35">demo network</span>
            ) : (
              <span className="hidden sm:block pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35">connecting</span>
            )}
            {engine.isAuthenticated ? (
              <Link
                href="/settings#usage"
                title="credits and usage"
                className="pixel-sans text-[11.5px] text-white/55 hover:text-white border border-white/10 hover:border-white/20 rounded-full px-3 py-1 transition-colors"
              >
                {engine.credits.balance ?? '…'} cr
              </Link>
            ) : (
              <button
                onClick={() => engine.login()}
                className="l3-press cursor-pointer pixel-sans text-[12px] font-medium bg-white text-black rounded-full px-3.5 py-1.5 hover:bg-white/90"
              >
                sign in
              </button>
            )}
            <button
              onClick={onNew}
              title="new conversation"
              aria-label="new conversation"
              className="l3-press cursor-pointer md:hidden p-2 -mr-0.5 rounded-lg text-white/45 hover:text-white hover:bg-white/[0.05]"
            >
              <IconPlus className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          onWheel={cancelGlide}
          onTouchStart={cancelGlide}
          className="h-full overflow-y-auto overscroll-contain"
        >
          {empty && !liveHere && !error ? (
            <div className="h-full flex flex-col items-center justify-center px-6 pb-40 text-center">
              <div className="l3-rise">
                <p className="pixel-serif text-3xl md:text-4xl text-white/90">Ask the network.</p>
                <p className="pixel-sans text-[13.5px] text-white/40 mt-3 max-w-sm mx-auto leading-relaxed">
                  Answers stream in from GPUs across the network. Your conversations stay in this browser.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-2">
                  {STARTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => onSend(s, [])}
                      className="l3-press cursor-pointer pixel-sans text-[12.5px] text-white/55 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/[0.03] rounded-full px-4 py-2"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 md:px-6 pt-6 md:pt-10 pb-48 space-y-7">
              {convo?.messages.map(m => (
                <MessageView key={m.id} msg={m} pendingImage={m.id === pendingImageMsgId} />
              ))}
              {liveHere && live && <LiveBlock live={live} />}
              {error && (
                <div className="l3-rise rounded-2xl border border-red-300/20 bg-red-400/[0.05] px-4 py-3 flex flex-wrap items-center gap-3">
                  <span className="pixel-sans text-[13.5px] text-red-200/90 flex-1 min-w-[12rem]">{error}</span>
                  {canRetry && (
                    <button
                      onClick={onRetry}
                      className="l3-press cursor-pointer pixel-sans text-[11px] uppercase tracking-[0.12em] text-white bg-white/10 hover:bg-white/15 rounded-full px-3.5 py-1.5"
                    >
                      try again
                    </button>
                  )}
                  <button
                    onClick={onDismissError}
                    className="cursor-pointer pixel-sans text-[11px] text-white/40 hover:text-white transition-colors"
                  >
                    dismiss
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* the floating foot: fade, jump pill, glass composer */}
        <div className="absolute inset-x-0 bottom-0 z-20 pointer-events-none">
          <div className="absolute inset-x-0 -top-10 bottom-0 bg-gradient-to-t from-[#0c0a09] via-[rgba(12,10,9,0.82)] to-transparent" />
          <div className="relative max-w-3xl mx-auto px-3 md:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={jumpToBottom}
              title="jump to latest"
              aria-label="jump to latest"
              aria-hidden={!showJump}
              tabIndex={showJump ? 0 : -1}
              className={`l3-jump absolute -top-12 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full border border-white/15 bg-[#161311] text-white/70 hover:text-white flex items-center justify-center shadow-[0_12px_32px_-8px_rgba(0,0,0,0.7)] ${
                showJump ? 'cursor-pointer pointer-events-auto opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-2'
              }`}
            >
              <IconChevronDown className="w-4 h-4" />
            </button>
            <div className="pointer-events-auto">
              <Composer
                key={draftKey}
                engine={engine}
                plan={plan}
                think={think}
                getDraft={() => draftsRef.current[draftKey] ?? ''}
                onDraftChange={t => { draftsRef.current[draftKey] = t; }}
                busyHere={liveHere}
                busyElsewhere={liveElsewhere || (engine.busy && !liveHere)}
                anonBlocked={anonBlocked}
                onSend={onSend}
                onStop={onStop}
                onSelectModel={onSelectModel}
                onToggleThink={onToggleThink}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

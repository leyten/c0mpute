'use client';

// The page being read and written. A calm reading measure, the stream rendered
// through the same markdown path as saved messages so the two can never drift,
// and pin-to-bottom scrolling that follows the pen only while the reader is
// already at the bottom.

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseThinking, type Plan, type PlanId } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import type { ChatEngine } from '../../engine/useChatEngine';
import type { LiveJob, Thread } from './store';
import MessageView, { ImageSkeleton } from './Message';
import Composer from './Composer';
import { Wordmark } from './Sidebar';
import { IconChevronDown, IconCompose, IconMenu } from './Icons';

const STARTERS = [
  'Explain speculative decoding, with sources',
  'Show me the attention math',
  'Write a Python client for the API',
];

function LiveBlock({ live }: { live: LiveJob }) {
  const { thinking, response } = parseThinking(live.text);
  const inThink = live.text.lastIndexOf('<think>') > live.text.lastIndexOf('</think>');
  const status = !response && !thinking
    ? live.status === 'queued'
      ? live.queuePos !== null && live.queuePos > 0
        ? `position ${live.queuePos} in the queue`
        : 'waiting for a worker'
      : live.status === 'searching'
        ? 'searching the web'
        : 'writing'
    : null;

  return (
    <div className="ln-enter">
      {live.sources.length > 0 && (
        <div className="ln-sources">
          <SourceStrip sources={live.sources} content={response} />
        </div>
      )}
      {thinking && (
        <div className="ln-think mb-2">
          <ThinkingDropdown thinking={thinking} isStreaming={inThink} />
        </div>
      )}
      {status && (
        <div className="flex items-center gap-2.5 py-1">
          <span className="ln-live-dot" />
          <span className="pixel-sans text-[12px] ln-mute">{status}</span>
        </div>
      )}
      {response && (
        <MessageMarkdown content={response} sources={live.sources} trailing={<span className="ln-caret" aria-hidden />} />
      )}
      {live.genImage && <ImageSkeleton />}
    </div>
  );
}

function EmptyState({ onStarter }: { onStarter: (s: string) => void }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="pixel-serif text-[30px] md:text-[34px] ln-ink">Ask anything.</h1>
      <p className="pixel-sans text-[13.5px] ln-mute mt-3.5 max-w-[22rem] leading-relaxed">
        Answers are written by the open compute network. Conversations stay in this browser.
      </p>
      <div className="mt-9 flex flex-col items-stretch gap-2 w-full max-w-[21rem]">
        {STARTERS.map(s => (
          <button
            key={s}
            onClick={() => onStarter(s)}
            className="ln-t cursor-pointer border ln-hair ln-hov-line ln-hov-tint rounded-xl px-4 py-2.5 pixel-sans text-[13px] ln-faint ln-hov-ink text-left"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function NetLabel({ engine }: { engine: ChatEngine }) {
  if (engine.live) {
    return (
      <span className="flex items-center gap-2 pixel-sans text-[10px] uppercase tracking-[0.14em] ln-mute">
        <span className="ln-live-dot" />
        {engine.stats?.workersOnline ?? 0} workers
      </span>
    );
  }
  return (
    <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] ln-ghost">
      {engine.demo ? 'demo network' : 'connecting'}
    </span>
  );
}

export default function ThreadView({ engine, thread, plan, think, live, error, canRetry, pendingImageMsgId, anonBlocked, draftKey, getDraft, onDraftChange, onOpenSidebar, onNew, onRename, onSend, onRetry, onStop, onDismissError, onSelectModel, onToggleThink }: {
  engine: ChatEngine;
  thread: Thread | null;
  plan: Plan;
  think: boolean;
  live: LiveJob | null;
  error: string | null;
  canRetry: boolean;
  pendingImageMsgId: string | null;
  anonBlocked: boolean;
  draftKey: string;
  getDraft: () => string;
  onDraftChange: (t: string) => void;
  onOpenSidebar: () => void;
  onNew: () => void;
  onRename: (title: string) => void;
  onSend: (text: string, images: string[]) => boolean;
  onRetry: () => void;
  onStop: () => void;
  onDismissError: () => void;
  onSelectModel: (id: PlanId) => void;
  onToggleThink: () => void;
}) {
  const liveHere = live !== null && thread !== null && live.threadId === thread.id;
  const busyElsewhere = live !== null && !liveHere;

  // Rename inline in the top bar.
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const commitRename = () => {
    setEditing(false);
    const v = editValue.trim();
    if (v && thread && v !== thread.title) onRename(v);
  };

  // Pin-to-bottom scrolling: follow the stream only while the reader is at
  // the bottom; otherwise offer a quiet way down instead of yanking them.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Instant, not smooth: while a stream is live the pin effect snaps to the
  // bottom anyway, and a smooth scroll mid-flight makes the button flicker.
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setShowJump(false);
  }, []);
  // The view is keyed by conversation, so mount = entering it: start at the
  // latest line, pinned. State resets (editing, jump) come with the remount.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
  }, []);
  useEffect(() => {
    if (pinnedRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [live?.text, live?.status, live?.genImage, thread?.messages.length, error]);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = pinned;
    setShowJump(!pinned);
    setScrolled(el.scrollTop > 8);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header
        className="shrink-0 border-b transition-colors duration-300"
        style={{ borderColor: scrolled ? 'var(--ln-line)' : 'transparent' }}
      >
        <div className="h-14 px-3 md:px-6 flex items-center gap-2">
          <button
            onClick={onOpenSidebar}
            title="conversations"
            className="md:hidden ln-t cursor-pointer p-2 rounded-lg ln-mute ln-hov-ink ln-hov-tint shrink-0"
          >
            <IconMenu className="w-[18px] h-[18px]" />
          </button>
          <div className="flex-1 min-w-0 pl-1">
            {thread ? (
              editing ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditing(false);
                  }}
                  className="w-full max-w-[26rem] bg-transparent outline-none border-b ln-hair-strong pixel-serif text-[16.5px] ln-ink"
                />
              ) : (
                <button
                  onClick={() => { setEditValue(thread.title); setEditing(true); }}
                  title="rename"
                  className="cursor-text block max-w-full text-left"
                >
                  <span className="ln-t ln-hov-ink pixel-serif text-[16.5px] ln-faint truncate block">
                    {thread.title}
                  </span>
                </button>
              )
            ) : (
              <>
                <span className="md:hidden"><Wordmark /></span>
                <span className="hidden md:block pixel-sans text-[12px] ln-ghost">new conversation</span>
              </>
            )}
          </div>
          <div className="hidden sm:flex shrink-0">
            <NetLabel engine={engine} />
          </div>
          <button
            onClick={onNew}
            title="new conversation"
            className="md:hidden ln-t cursor-pointer p-2 rounded-lg ln-mute ln-hov-ink ln-hov-tint shrink-0"
          >
            <IconCompose className="w-[18px] h-[18px]" />
          </button>
        </div>
      </header>

      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
          {thread === null ? (
            <EmptyState onStarter={s => onSend(s, [])} />
          ) : (
            <div key={thread.id} className="max-w-[42rem] mx-auto px-4 md:px-6 pt-6 md:pt-8 pb-8 space-y-7">
              {thread.messages.map(m => (
                <MessageView key={m.id} msg={m} pendingImage={m.id === pendingImageMsgId} />
              ))}
              {liveHere && live && <LiveBlock live={live} />}
              {error && (
                <div className="ln-enter flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
                  <span className="pixel-sans text-[13px] text-[#dba99b] leading-relaxed">{error}</span>
                  {canRetry && (
                    <button
                      onClick={onRetry}
                      className="ln-t cursor-pointer pixel-sans text-[12px] ln-faint ln-hov-ink underline underline-offset-4 decoration-[rgba(237,230,216,0.3)]"
                    >
                      try again
                    </button>
                  )}
                  <button onClick={onDismissError} className="ln-t cursor-pointer pixel-sans text-[12px] ln-ghost ln-hov-ink">
                    dismiss
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-[#13100d] to-transparent" />
        <button
          onClick={jumpToBottom}
          title="jump to latest"
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 w-[34px] h-[34px] rounded-full border ln-hair-strong ln-bg-pop ln-faint shadow-lg shadow-black/40 flex items-center justify-center transition-all duration-250 ${showJump ? 'opacity-100 cursor-pointer' : 'opacity-0 translate-y-1 pointer-events-none'}`}
        >
          <IconChevronDown className="w-4 h-4" />
        </button>
      </div>

      <Composer
        key={draftKey}
        engine={engine}
        plan={plan}
        think={think}
        getDraft={getDraft}
        onDraftChange={onDraftChange}
        busyHere={liveHere}
        busyElsewhere={busyElsewhere}
        anonBlocked={anonBlocked}
        onSend={onSend}
        onStop={onStop}
        onSelectModel={onSelectModel}
        onToggleThink={onToggleThink}
      />
    </div>
  );
}

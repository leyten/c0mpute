'use client';

// A focused conversation. Opening one is entering a place: the top bar names
// it and holds its desk controls (pin, archive, delete), Escape or the desk
// button leads back out. The stream renders through the same markdown path as
// saved messages so the two can never drift.

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseThinking, type Plan, type PlanId } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import type { ChatEngine } from '../../engine/useChatEngine';
import type { Convo, LiveJob } from './store';
import MessageView, { ImageSkeleton } from './MessageView';
import Composer from './Composer';
import { IconArchive, IconChevronDown, IconChevronLeft, IconPin, IconTrash } from './Icons';
import { LifecycleStrip, WorkLedger } from './provenance';

function LiveBlock({ live, now, onStop }: { live: LiveJob; now: number; onStop: () => void }) {
  const { thinking, response } = parseThinking(live.text);
  const inThink = live.text.lastIndexOf('<think>') > live.text.lastIndexOf('</think>');
  const elapsed = Math.max(0, now - live.submittedAt);

  return (
    <div>
      {/* the lifecycle, in the map's square language, near the streaming block */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
        <LifecycleStrip live={live} elapsedMs={elapsed} />
        <button
          onClick={onStop}
          className="cursor-pointer pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35 hover:text-white transition-colors"
        >
          stop
        </button>
      </div>
      {live.status === 'searching' && (
        <div className="mb-2 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40">searching the web</div>
      )}
      {live.sources.length > 0 && <SourceStrip sources={live.sources} content={response} />}
      {thinking && (
        <div className="mb-2">
          <ThinkingDropdown thinking={thinking} isStreaming={inThink} />
        </div>
      )}
      {response && <MessageMarkdown content={response} sources={live.sources} />}
      {live.genImage && <ImageSkeleton />}
    </div>
  );
}

export default function Room({ engine, convo, live, error, canRetry, pendingImageMsgId, anonBlocked, getDraft, onDraftChange, onBack, onRename, onTogglePin, onToggleArchive, onDelete, onSend, onRetry, onStop, onDismissError, onSelectModel, onToggleThink }: {
  engine: ChatEngine;
  convo: Convo;
  live: LiveJob | null;
  error: string | null;
  canRetry: boolean;
  pendingImageMsgId: string | null;
  anonBlocked: boolean;
  getDraft: () => string;
  onDraftChange: (t: string) => void;
  onBack: () => void;
  onRename: (subject: string) => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
  onSend: (text: string, images: string[]) => boolean;
  onRetry: () => void;
  onStop: () => void;
  onDismissError: () => void;
  onSelectModel: (id: PlanId) => void;
  onToggleThink: () => void;
}) {
  const plan: Plan = engine.models.find(m => m.id === convo.model) ?? engine.models[0];
  const liveHere = live !== null && live.convoId === convo.id;
  const liveElsewhere = live !== null && live.convoId !== convo.id;

  // The work ledger for this conversation, opened from the top bar.
  const [workOpen, setWorkOpen] = useState(false);

  // A live clock for the in-flight lifecycle strip, ticking only while a job
  // is running here. The elapsed readout is clamped at 0, so it reads 0.0s for
  // the first sub-second frame (the job is still "submitted") until the first
  // tick lands the real time — no synchronous setState in the effect body.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!liveHere) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [liveHere]);

  // Rename inline in the top bar.
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(convo.subject);
  const commitRename = () => {
    setEditing(false);
    const v = editValue.trim();
    if (v && v !== convo.subject) onRename(v);
  };

  // Two-step delete.
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  // Pin-to-bottom scrolling: follow the stream only while the reader is at
  // the bottom; otherwise offer a jump button instead of yanking them down.
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setShowJump(false);
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
  }, [convo.id]);
  useEffect(() => {
    if (pinnedRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [live?.text, live?.status, live?.genImage, convo.messages.length]);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = pinned;
    setShowJump(!pinned);
  }, []);

  // Escape closes the work ledger if open, otherwise leaves the room. Rename
  // input keeps its own Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target as HTMLElement | null;
      if (t && t.tagName === 'INPUT') return;
      if (workOpen) { setWorkOpen(false); return; }
      onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, workOpen]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="border-b border-white/10 shrink-0">
        <div className="max-w-5xl mx-auto px-3 md:px-6 h-14 flex items-center gap-2 md:gap-4">
          <button
            onClick={onBack}
            className="cursor-pointer flex items-center gap-1 pixel-sans text-[11px] uppercase tracking-[0.14em] text-white/50 hover:text-white transition-colors shrink-0"
            title="back to the desk (esc)"
          >
            <IconChevronLeft className="w-4 h-4" />
            desk
          </button>
          <div className="h-5 w-px bg-white/10 shrink-0" />
          <div className="flex-1 min-w-0">
            {editing ? (
              <input
                autoFocus
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') { setEditing(false); setEditValue(convo.subject); }
                }}
                className="w-full bg-transparent outline-none border-b border-white/25 pixel-serif text-lg md:text-xl text-white"
              />
            ) : (
              <button
                onClick={() => { setEditValue(convo.subject); setEditing(true); }}
                title="rename"
                className="cursor-text block max-w-full text-left"
              >
                <span className="pixel-serif text-lg md:text-xl text-white truncate block">{convo.subject}</span>
              </button>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2 pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35 shrink-0">
            <span>{plan.name}</span>
            <span className="text-white/15">·</span>
            <span>{convo.messages.length} messages</span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <div className="relative">
              <button
                onClick={() => setWorkOpen(o => !o)}
                title="work ledger for this conversation"
                className={`cursor-pointer px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors pixel-sans text-[10px] uppercase tracking-[0.14em] ${workOpen ? 'text-[#80a0c1]' : 'text-white/40 hover:text-white'}`}
              >
                work
              </button>
              {workOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setWorkOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-40 w-[22rem] max-w-[calc(100vw-1.5rem)] max-h-[60vh] overflow-y-auto rounded-xl border border-white/10 bg-[#161311] p-4 shadow-2xl shadow-black/60">
                    <div className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/35 mb-3">work in this conversation</div>
                    <WorkLedger convo={convo} />
                  </div>
                </>
              )}
            </div>
            <button
              onClick={onTogglePin}
              title={convo.pinned ? 'unpin' : 'pin to the desk'}
              className={`cursor-pointer p-2 rounded-lg hover:bg-white/[0.06] transition-colors ${convo.pinned ? 'text-[#80a0c1]' : 'text-white/40 hover:text-white'}`}
            >
              <IconPin className="w-4 h-4" filled={convo.pinned} />
            </button>
            <button
              onClick={onToggleArchive}
              title={convo.archived ? 'restore to the desk' : 'archive'}
              className={`cursor-pointer p-2 rounded-lg hover:bg-white/[0.06] transition-colors ${convo.archived ? 'text-[#80a0c1]' : 'text-white/40 hover:text-white'}`}
            >
              <IconArchive className="w-4 h-4" />
            </button>
            <button
              onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
              title={confirmDelete ? 'click again to delete' : 'delete conversation'}
              className={`cursor-pointer p-2 rounded-lg hover:bg-white/[0.06] transition-colors ${confirmDelete ? 'text-red-300' : 'text-white/40 hover:text-white'}`}
            >
              {confirmDelete ? (
                <span className="pixel-sans text-[10px] uppercase tracking-[0.1em]">sure?</span>
              ) : (
                <IconTrash className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-7">
            {convo.messages.length === 0 && !liveHere && (
              <div className="py-16 md:py-24 text-center">
                <p className="pixel-serif text-2xl md:text-3xl text-white/85">A fresh page.</p>
                <p className="pixel-sans text-sm text-white/45 mt-3 max-w-sm mx-auto leading-relaxed">
                  Write the first message below. This conversation takes its place on the desk once it starts.
                </p>
              </div>
            )}
            {convo.messages.map(m => (
              <MessageView key={m.id} msg={m} pendingImage={m.id === pendingImageMsgId} />
            ))}
            {liveHere && live && <LiveBlock live={live} now={now} onStop={onStop} />}
            {error && (
              <div className="border border-red-400/25 bg-red-400/[0.05] rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="pixel-sans text-sm text-red-200/90 flex-1 min-w-[12rem]">{error}</span>
                {canRetry && (
                  <button
                    onClick={onRetry}
                    className="cursor-pointer pixel-sans text-[11px] uppercase tracking-[0.12em] text-white bg-white/10 hover:bg-white/15 rounded-full px-3.5 py-1.5 transition-colors"
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
        </div>
        {showJump && (
          <button
            onClick={jumpToBottom}
            title="jump to latest"
            className="cursor-pointer absolute bottom-4 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full border border-white/15 bg-[#161311] text-white/70 hover:text-white flex items-center justify-center shadow-lg shadow-black/40"
          >
            <IconChevronDown className="w-4 h-4" />
          </button>
        )}
      </div>

      <Composer
        key={convo.id}
        engine={engine}
        plan={plan}
        think={convo.think}
        getDraft={getDraft}
        onDraftChange={onDraftChange}
        busyHere={liveHere}
        busyElsewhere={liveElsewhere}
        anonBlocked={anonBlocked}
        onSend={onSend}
        onSelectModel={onSelectModel}
        onToggleThink={onToggleThink}
      />
    </div>
  );
}

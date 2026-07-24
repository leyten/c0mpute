'use client';

// The open conversation: a slim header, the message column, the composer.
// The stream renders through the same markdown path as saved messages so the
// two can never drift; scrolling follows the stream only while the reader is
// already at the bottom.

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseThinking, type Plan, type PlanId } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import type { ChatEngine } from '../../engine/useChatEngine';
import type { Chat, LiveJob } from './store';
import Message, { ImageSkeleton } from './Message';
import Composer from './Composer';
import { IconChevronDown, IconPanel } from './Icons';

const STARTERS = [
  'Explain speculative decoding, with sources',
  'Show me the attention math',
  'Write a Python client for the API',
];

function LiveBlock({ live }: { live: LiveJob }) {
  const { thinking, response } = parseThinking(live.text);
  const inThink = live.text.lastIndexOf('<think>') > live.text.lastIndexOf('</think>');
  const showLabel = live.status !== 'streaming' || (!response && !thinking);
  const label =
    live.status === 'queued'
      ? live.queuePos !== null && live.queuePos > 0 ? `queued · position ${live.queuePos}` : 'queued'
      : live.status === 'searching'
        ? 'searching the web'
        : 'writing';

  return (
    <div className="l2-rise">
      {showLabel && (
        <div className="h-4 mb-2 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[rgba(52,211,153,0.9)] animate-pulse" />
          <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/40 tabular-nums">{label}</span>
        </div>
      )}
      {live.sources.length > 0 && <SourceStrip sources={live.sources} content={response} />}
      {thinking && (
        <div className="mb-2">
          <ThinkingDropdown thinking={thinking} isStreaming={inThink} />
        </div>
      )}
      {response && (
        <MessageMarkdown
          content={response}
          sources={live.sources}
          trailing={<span className="l2-caret" aria-hidden="true" />}
        />
      )}
      {live.genImage && <ImageSkeleton />}
    </div>
  );
}

// The scroll column, keyed by chat id from the thread so its state resets by
// remount. Pin-to-bottom scrolling: follow new content only while the reader
// is at the bottom; otherwise offer a jump button instead of yanking them down.
function ScrollColumn({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // Open at the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);
  // Follow whatever arrived this render while pinned; a no-op at the bottom.
  useEffect(() => {
    if (pinnedRef.current) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  });

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    pinnedRef.current = true;
    setShowJump(false);
  }, []);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = pinned;
    setShowJump(!pinned && el.scrollHeight > el.clientHeight);
  }, []);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        {children}
      </div>
      {showJump && (
        <button
          onClick={jumpToBottom}
          title="jump to latest"
          className="cursor-pointer absolute bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 rounded-md border border-white/15 bg-[#14161a] text-white/70 hover:text-white flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-colors duration-150 ease-out"
        >
          <IconChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function Thread({ engine, chat, live, error, canRetry, pendingImageMsgId, anonBlocked, getDraft, onDraftChange, onOpenSidebar, onSend, onRetry, onStop, onDismissError, onSelectModel, onToggleThink }: {
  engine: ChatEngine;
  chat: Chat;
  live: LiveJob | null;
  error: string | null;
  canRetry: boolean;
  pendingImageMsgId: string | null;
  anonBlocked: boolean;
  getDraft: () => string;
  onDraftChange: (t: string) => void;
  onOpenSidebar: () => void;
  onSend: (text: string, images: string[]) => boolean;
  onRetry: () => void;
  onStop: () => void;
  onDismissError: () => void;
  onSelectModel: (id: PlanId) => void;
  onToggleThink: () => void;
}) {
  const plan: Plan = engine.models.find(m => m.id === chat.model) ?? engine.models[0];
  const liveHere = live !== null && live.chatId === chat.id;
  const liveElsewhere = live !== null && live.chatId !== chat.id;
  const empty = chat.messages.length === 0 && !liveHere;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="h-12 shrink-0 border-b border-white/10 flex items-center gap-3 px-3 md:px-4">
        <button
          onClick={onOpenSidebar}
          title="conversations"
          className="cursor-pointer md:hidden w-8 h-8 -ml-1 rounded-md flex items-center justify-center text-white/50 hover:text-white transition-colors duration-150"
        >
          <IconPanel className="w-4 h-4" />
        </button>
        <h1 className={`flex-1 min-w-0 truncate pixel-sans text-[13px] font-medium ${chat.autoTitle && chat.messages.length === 0 ? 'text-white/40' : 'text-white/80'}`}>
          {chat.title}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${engine.connected ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/20'}`} />
          <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/30">
            {engine.demo ? 'preview' : engine.live ? 'online' : 'offline'}
          </span>
        </div>
      </header>

      <ScrollColumn key={chat.id}>
        {empty ? (
          <div className="h-full flex flex-col items-center justify-center px-6 pb-16">
            <p className="pixel-serif text-3xl text-white/90 text-center">Ready when you are.</p>
            <p className="pixel-sans text-[13px] leading-5 text-white/45 mt-3 text-center max-w-xs">
              Ask anything. Replies stream live from GPUs across the network.
            </p>
            <div className="mt-8 flex flex-col items-stretch gap-2 w-full max-w-sm">
              {STARTERS.map(s => (
                <button
                  key={s}
                  onClick={() => onSend(s, [])}
                  className="cursor-pointer h-8 px-3 rounded-md border border-white/10 hover:border-white/25 pixel-sans text-[13px] text-white/60 hover:text-white text-left truncate transition-colors duration-150 ease-out"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-[44rem] mx-auto px-4 md:px-6 py-6 space-y-6">
            {chat.messages.map(m => (
              <Message key={m.id} msg={m} pendingImage={m.id === pendingImageMsgId} />
            ))}
            {liveHere && live && <LiveBlock live={live} />}
            {error && (
              <div className="l2-rise border border-red-400/25 bg-red-400/[0.04] rounded-lg px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="pixel-sans text-[13px] leading-5 text-red-200/90 flex-1 min-w-[12rem]">{error}</span>
                {canRetry && (
                  <button
                    onClick={onRetry}
                    className="cursor-pointer h-7 px-2.5 rounded-md border border-white/15 hover:border-white/30 pixel-sans text-[12px] text-white/90 hover:text-white transition-colors duration-150"
                  >
                    try again
                  </button>
                )}
                <button
                  onClick={onDismissError}
                  className="cursor-pointer pixel-sans text-[12px] text-white/40 hover:text-white transition-colors duration-150"
                >
                  dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </ScrollColumn>

      <Composer
        key={chat.id}
        engine={engine}
        plan={plan}
        think={chat.think}
        getDraft={getDraft}
        onDraftChange={onDraftChange}
        busyHere={liveHere}
        busyElsewhere={liveElsewhere}
        anonBlocked={anonBlocked}
        onSend={onSend}
        onStop={onStop}
        onSelectModel={onSelectModel}
        onToggleThink={onToggleThink}
      />
    </div>
  );
}

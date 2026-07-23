'use client';

// The transcript: one centered column, prompts set in the editorial serif,
// answers in prose. Renders the committed thread plus the live streaming turn
// (queue position, web search, thinking, image skeleton) and honest errors.

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseThinking, type SourceRef } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import type { Instrument } from './useInstrument';
import type { StoredMessage } from './types';

function ImageGrid({ images, alt }: { images: string[]; alt: string }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {images.map((src, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={src} alt={alt} className="max-h-80 max-w-full rounded-lg border border-white/10" />
      ))}
    </div>
  );
}

function WorkingRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="pixel-sans flex items-center gap-2 text-sm text-white/45">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/50" />
      <span>{children}</span>
      <span className="thinking-dots"><span className="dot">.</span><span className="dot">.</span><span className="dot">.</span></span>
    </div>
  );
}

function ImageSkeleton() {
  return (
    <div className="mt-3">
      <div className="h-48 w-72 max-w-full animate-pulse rounded-lg border border-white/10 bg-white/[0.04]" />
      <div className="pixel-sans mt-1.5 text-[11px] text-white/35">rendering image</div>
    </div>
  );
}

function AssistantBody({ content, sources, thinkSeconds, streaming }: {
  content: string;
  sources: SourceRef[];
  thinkSeconds?: number;
  streaming?: boolean;
}) {
  const parsed = parseThinking(content);
  const opens = (content.match(/<think>/g) ?? []).length;
  const closes = (content.match(/<\/think>/g) ?? []).length;
  const stillThinking = !!streaming && opens > closes;
  const caret = streaming && !stillThinking
    ? <span className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 animate-pulse bg-white/60" />
    : undefined;
  return (
    <>
      {parsed.thinking && (
        <ThinkingDropdown
          thinking={parsed.thinking}
          isStreaming={stillThinking}
          elapsedSeconds={thinkSeconds ?? parsed.thinkSeconds ?? undefined}
          defaultOpen={streaming}
        />
      )}
      {sources.length > 0 && (
        <div className="mt-3">
          <SourceStrip sources={sources} content={parsed.response} />
        </div>
      )}
      {(parsed.response || caret) && (
        <div className="mt-2">
          <MessageMarkdown content={parsed.response} sources={sources} trailing={caret} />
        </div>
      )}
    </>
  );
}

function MessageView({ m, awaitingImage, onCopy, copied }: {
  m: StoredMessage;
  awaitingImage: boolean;
  onCopy: (m: StoredMessage) => void;
  copied: boolean;
}) {
  if (m.role === 'user') {
    return (
      <div className="mt-10 first:mt-0">
        {m.images && m.images.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {m.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="attached" className="h-20 w-20 rounded-md border border-white/10 object-cover" />
            ))}
          </div>
        )}
        <div className="pixel-serif text-[19px] leading-snug text-white/95">{m.content}</div>
      </div>
    );
  }
  return (
    <div className="group mt-4">
      <AssistantBody content={m.content} sources={m.sources ?? []} thinkSeconds={m.thinkSeconds} />
      {m.images && m.images.length > 0 && <ImageGrid images={m.images} alt="generated" />}
      {awaitingImage && <ImageSkeleton />}
      {m.stopped && <div className="pixel-sans mt-2 text-[11px] text-white/35">stopped before the reply finished</div>}
      <div className="mt-1.5 h-5">
        <button
          onClick={() => onCopy(m)}
          className="pixel-sans cursor-pointer text-[11px] text-white/0 transition-colors hover:text-white/70 group-hover:text-white/35"
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
    </div>
  );
}

export default function Transcript({ inst, modKey }: { inst: Instrument; modKey: string }) {
  const { engine, activeThread, turn, turnError, awaitingImage } = inst;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [unpinned, setUnpinned] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const liveTurn = turn && activeThread && turn.threadId === activeThread.id ? turn : null;
  const visibleError = turnError && turnError.threadId === (activeThread?.id ?? '') ? turnError : null;

  // The scroll event is the single writer of pin state: programmatic scrolls
  // below also fire it, so `unpinned` stays in sync without effect setState.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    pinnedRef.current = pinned;
    setUnpinned(!pinned);
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
  }, []);

  // Pin to the bottom when switching threads.
  const activeThreadId = activeThread?.id ?? null;
  useEffect(() => {
    scrollToBottom();
  }, [activeThreadId, scrollToBottom]);

  // Follow the stream while pinned.
  const liveText = liveTurn?.text;
  const messageCount = activeThread?.messages.length ?? 0;
  useEffect(() => {
    if (!pinnedRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [liveText, messageCount, liveTurn?.searching, liveTurn?.imaging, liveTurn?.images.length]);

  const copyMessage = useCallback((m: StoredMessage) => {
    const text = parseThinking(m.content).response;
    void navigator.clipboard.writeText(text);
    setCopiedId(m.id);
    setTimeout(() => setCopiedId(prev => (prev === m.id ? null : prev)), 2000);
  }, []);

  // Zero state: no conversation selected. The composer below is already live,
  // so this is orientation, not a blocker.
  if (!activeThread) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        {inst.hydrated && (
          <>
            <div className="pixel-serif text-3xl text-white/90 sm:text-4xl">Ask the network.</div>
            <div className="pixel-sans mt-3 max-w-md text-sm leading-relaxed text-white/45">
              Your prompt runs on GPUs contributed by people around the world.
              {engine.stats ? ` ${engine.stats.workersOnline} workers are online now.` : ''}
            </div>
            <div className="pixel-sans mt-6 text-xs text-white/35">
              Type below to begin, or press{' '}
              <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/60">{modKey}K</kbd>{' '}
              for models, conversations, and settings.
            </div>
            {visibleError && (
              <ErrorBlock error={visibleError} inst={inst} canRetry={false} />
            )}
          </>
        )}
      </div>
    );
  }

  const lastIsUser = activeThread.messages[activeThread.messages.length - 1]?.role === 'user';

  return (
    <div className="relative h-full">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-[44rem] px-4 pb-10 pt-8 sm:px-6">
          {activeThread.messages.map(m => (
            <MessageView
              key={m.id}
              m={m}
              awaitingImage={awaitingImage?.messageId === m.id}
              onCopy={copyMessage}
              copied={copiedId === m.id}
            />
          ))}

          {liveTurn && (
            <div className="mt-4">
              {!liveTurn.started && !liveTurn.searching && (
                <WorkingRow>
                  {liveTurn.queuePos !== null && liveTurn.queuePos > 0
                    ? `queued, position ${liveTurn.queuePos}`
                    : 'waiting for a worker'}
                </WorkingRow>
              )}
              {liveTurn.searching && <WorkingRow>searching the web</WorkingRow>}
              {liveTurn.text && (
                <AssistantBody content={liveTurn.text} sources={liveTurn.sources} streaming />
              )}
              {liveTurn.images.length > 0 && <ImageGrid images={liveTurn.images} alt="generated" />}
              {liveTurn.imaging && liveTurn.images.length === 0 && <ImageSkeleton />}
            </div>
          )}

          {visibleError && <ErrorBlock error={visibleError} inst={inst} canRetry={lastIsUser && !liveTurn} />}
        </div>
      </div>

      {unpinned && liveTurn && (
        <button
          onClick={() => { scrollToBottom(); setUnpinned(false); }}
          className="pixel-sans absolute bottom-4 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border border-white/15 bg-[#0c0a09]/90 px-3 py-1.5 text-xs text-white/70 backdrop-blur transition-colors hover:text-white"
        >
          jump to latest
        </button>
      )}
    </div>
  );
}

function ErrorBlock({ error, inst, canRetry }: {
  error: NonNullable<Instrument['turnError']>;
  inst: Instrument;
  canRetry: boolean;
}) {
  return (
    <div className="mt-6 rounded-lg border border-red-400/20 bg-red-400/[0.05] px-4 py-3 text-left">
      <div className="pixel-sans text-sm text-red-200/90">{error.message}</div>
      <div className="pixel-sans mt-2 flex items-center gap-4 text-xs">
        {canRetry && (
          <button onClick={inst.retry} className="cursor-pointer text-white/80 underline underline-offset-2 hover:text-white">
            Retry
          </button>
        )}
        {error.signIn && (
          <button onClick={() => inst.engine.login()} className="cursor-pointer text-white/80 underline underline-offset-2 hover:text-white">
            Sign in
          </button>
        )}
        {error.topUp && (
          <a href="/settings#usage" className="cursor-pointer text-white/80 underline underline-offset-2 hover:text-white">
            Top up credits
          </a>
        )}
        <button onClick={inst.dismissError} className="cursor-pointer text-white/40 hover:text-white/70">
          Dismiss
        </button>
      </div>
    </div>
  );
}

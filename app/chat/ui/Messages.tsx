'use client';

// User: a soft filled bubble, right-aligned, no border, no label.
// Assistant: bare text on the page, no avatar, no name repeated every turn.
import { useState } from 'react';
import { MessageMarkdown, SourceStrip } from '../components/MarkdownContent';
import ThinkingDropdown from '../components/ThinkingDropdown';
import { parseSourcesFromContent, parseThinking } from '../lib';
import type { Msg } from './store';
import { Copy, Check } from './Icons';

function Answer({ content, streaming }: { content: string; streaming?: boolean }) {
  const { cleanContent, sources } = parseSourcesFromContent(content);
  const { thinking, response, thinkSeconds } = parseThinking(cleanContent);
  const stillThinking = streaming && thinking !== null && !response.trim();

  return (
    <div className="cu-answer-wrap">
      {sources.length > 0 && <SourceStrip sources={sources} content={cleanContent} />}
      {thinking !== null && (
        <div className="mb-3">
          <ThinkingDropdown thinking={thinking} isStreaming={stillThinking} elapsedSeconds={thinkSeconds ?? undefined} />
        </div>
      )}
      {(response.trim() || !thinking) && (
        <div className="cu-answer">
          <MessageMarkdown
            content={response}
            sources={sources}
            trailing={streaming ? <span className="cu-caret" /> : undefined}
          />
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        const { cleanContent } = parseSourcesFromContent(text);
        const { response } = parseThinking(cleanContent);
        void navigator.clipboard.writeText(response.trim() || cleanContent);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] opacity-0 transition-all duration-150 hover:bg-white/[0.06] group-hover:opacity-100"
      style={{ color: 'var(--cu-faint)' }}
    >
      {done ? <Check /> : <Copy />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

export function Turn({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div className="cu-fade flex justify-end">
        <div className="max-w-[80%]">
          {msg.images && msg.images.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {msg.images.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="max-h-52 rounded-2xl" />
              ))}
            </div>
          )}
          {msg.content && (
            <div
              className="rounded-[20px] px-4 py-2.5 text-[16px] leading-[1.6]"
              style={{ background: 'var(--cu-surface)', color: 'var(--cu-text)' }}
            >
              {msg.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cu-fade group">
      <Answer content={msg.content} />
      {msg.images && msg.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {msg.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className="max-h-96 rounded-2xl" />
          ))}
        </div>
      )}
      <div className="-ml-2 mt-1.5"><CopyButton text={msg.content} /></div>
    </div>
  );
}

export function Live({
  text, state, queue, searching, generatingImage,
}: {
  text: string;
  state: 'queued' | 'streaming';
  queue: number | null;
  searching: boolean;
  generatingImage: boolean;
}) {
  const waiting = state === 'queued' || (!text && !searching);

  return (
    <div className="cu-fade">
      {searching && !text && (
        <div className="mb-2 flex items-center gap-2 text-[14px]" style={{ color: 'var(--cu-dim)' }}>
          <span className="cu-dots"><span /><span /><span /></span>
          Searching the web
        </div>
      )}

      {waiting && !searching && (
        <div className="flex items-center gap-2 text-[14px]" style={{ color: 'var(--cu-dim)' }}>
          <span className="cu-dots"><span /><span /><span /></span>
          {queue !== null && queue > 0 ? `Waiting for a worker, ${queue} ahead` : 'Reaching the network'}
        </div>
      )}

      {text && <Answer content={text} streaming />}

      {generatingImage && (
        <div className="mt-3 h-64 w-full max-w-sm animate-pulse rounded-2xl" style={{ background: 'var(--cu-surface)' }} />
      )}
    </div>
  );
}

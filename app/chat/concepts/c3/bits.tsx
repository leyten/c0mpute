'use client';

// Concept C3 shared atoms: the square/dot status language borrowed from the
// network map (solid emerald square = live/positive, hollow square = not yet,
// muted red = fault), the request block that opens every work unit, and the
// reply body renderer used by both the in-flight and the fulfilled views.

import ThinkingDropdown from '../../components/ThinkingDropdown';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import { parseThinking, type SourceRef } from '../../lib';
import { fmtUnitNumber } from './types';

export type SquareTone = 'live' | 'done' | 'idle' | 'off' | 'fault';

const SQUARE_TONES: Record<SquareTone, string> = {
  live: 'bg-[rgba(52,211,153,0.95)] shadow-[0_0_0_3px_rgba(52,211,153,0.15)]',
  done: 'bg-[rgba(52,211,153,0.9)]',
  idle: 'bg-white/40',
  off: 'border border-white/25 bg-transparent',
  fault: 'bg-[rgba(248,113,113,0.85)]',
};

export function Square({ tone, pulse = false, size = 7 }: { tone: SquareTone; pulse?: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${SQUARE_TONES[tone]} ${pulse ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Wordmark({ className = 'text-xl' }: { className?: string }) {
  return (
    <span className={`pixel-serif-logo text-white font-bold ${className}`}>
      c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
    </span>
  );
}

// The commission: quiet ledger label above, the user's words in the serif
// display face below. Long requests step down a size so they stay readable.
export function RequestBlock({ index, text, images }: { index: number; text: string; images?: string[] }) {
  const long = text.length > 240;
  return (
    <div>
      <div className="pixel-sans text-[11px] uppercase tracking-[0.16em] text-white/30">
        {fmtUnitNumber(index)} · request
      </div>
      {images && images.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`attachment ${i + 1}`} className="h-16 w-16 rounded-lg border border-white/10 object-cover" />
          ))}
        </div>
      )}
      <div className={`pixel-serif mt-2 whitespace-pre-wrap break-words text-white ${long ? 'text-[17px] leading-relaxed' : 'text-[21px] leading-snug'}`}>
        {text}
      </div>
    </div>
  );
}

const CARET = <span aria-hidden className="ml-1 inline-block h-4 w-[7px] translate-y-[2px] animate-pulse bg-[#80a0c1]/80" />;

// One renderer for the answer body so the streaming and the fulfilled views
// can never drift apart: thinking dropdown, source strip, markdown, images.
export function ReplyBody({
  text,
  sources,
  images,
  streaming,
  thinkSeconds,
  awaitingImage,
}: {
  text: string;
  sources: SourceRef[];
  images: string[];
  streaming: boolean;
  thinkSeconds: number | null;
  awaitingImage: boolean;
}) {
  const { thinking, response } = parseThinking(text);
  return (
    <div>
      {thinking && (
        <ThinkingDropdown
          thinking={thinking}
          isStreaming={streaming && !response}
          elapsedSeconds={thinkSeconds ?? undefined}
        />
      )}
      {sources.length > 0 && response && (
        <div className={thinking ? 'mt-4' : ''}>
          <SourceStrip sources={sources} content={streaming ? undefined : response} />
        </div>
      )}
      {response && (
        <div className={thinking && sources.length === 0 ? 'mt-3' : ''}>
          <MessageMarkdown content={response} sources={sources} trailing={streaming ? CARET : undefined} />
        </div>
      )}
      {images.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt={`generated image ${i + 1}`} className="max-w-full rounded-xl border border-white/10 md:max-w-md" />
          ))}
        </div>
      )}
      {awaitingImage && (
        <div className="mt-4 flex h-48 w-full max-w-md animate-pulse items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2.5">
            <Square tone="live" pulse size={6} />
            <span className="pixel-sans text-[11px] uppercase tracking-[0.16em] text-white/40">rendering an image</span>
          </div>
        </div>
      )}
    </div>
  );
}

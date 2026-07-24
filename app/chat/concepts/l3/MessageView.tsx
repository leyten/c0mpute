'use client';

// Message rendering. User turns sit right in a quiet glass bubble; assistant
// turns are plain text on the page, round-tripped through the pure parsers:
// thinking above the answer, source strip, markdown body, images. The live
// (streaming) block renders through the exact same path so the finished and
// in-flight views can never drift.

import { parseSourcesFromContent, parseThinking } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import { imgSrc, type GlassMessage, type LiveJob } from './store';

export function ImageSkeleton() {
  return (
    <div className="l3-shimmer mt-3 w-72 max-w-full h-48 rounded-2xl border border-white/10 flex items-center justify-center">
      <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35">rendering image</span>
    </div>
  );
}

export function LiveBlock({ live }: { live: LiveJob }) {
  const { thinking, response } = parseThinking(live.text);
  const inThink = live.text.lastIndexOf('<think>') > live.text.lastIndexOf('</think>');
  const label =
    live.status === 'queued'
      ? live.queuePos !== null && live.queuePos > 0 ? `queued · position ${live.queuePos}` : 'queued'
      : live.status === 'searching'
        ? 'searching the web'
        : inThink
          ? 'thinking'
          : 'writing';

  return (
    <div className="l3-rise">
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="l3-dot l3-dot-breathe" />
        <span className="pixel-sans text-[10.5px] uppercase tracking-[0.14em] text-white/40">{label}</span>
      </div>
      {live.sources.length > 0 && <SourceStrip sources={live.sources} content={response} />}
      {thinking && (
        <div className="mb-2">
          <ThinkingDropdown thinking={thinking} isStreaming={inThink} />
        </div>
      )}
      {response && (
        <div className="l3-caret">
          <MessageMarkdown content={response} sources={live.sources} />
        </div>
      )}
      {live.genImage && <ImageSkeleton />}
    </div>
  );
}

export default function MessageView({ msg, pendingImage }: { msg: GlassMessage; pendingImage?: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="l3-rise flex justify-end">
        <div className="max-w-[85%] md:max-w-[75%] px-4 py-2.5 bg-white/[0.055] border border-white/[0.08] rounded-[18px] rounded-br-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {msg.images && msg.images.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {msg.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={imgSrc(img)} alt="attached" className="max-w-[180px] max-h-[180px] rounded-lg object-cover border border-white/10" />
              ))}
            </div>
          )}
          {msg.content && (
            <p className="pixel-sans text-[15px] leading-relaxed text-white/90 whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>
      </div>
    );
  }

  const { cleanContent, sources } = parseSourcesFromContent(msg.content);
  const { thinking, response, thinkSeconds } = parseThinking(cleanContent);

  return (
    <div className="l3-rise">
      {thinking && (
        <div className="mb-2">
          <ThinkingDropdown thinking={thinking} elapsedSeconds={thinkSeconds ?? undefined} />
        </div>
      )}
      <SourceStrip sources={sources} content={response} />
      {response && <MessageMarkdown content={response} sources={sources} />}
      {msg.images && msg.images.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {msg.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={imgSrc(img)} alt="generated" className="max-w-[360px] w-full max-h-[360px] object-contain rounded-2xl border border-white/10" />
          ))}
        </div>
      )}
      {pendingImage && <ImageSkeleton />}
    </div>
  );
}

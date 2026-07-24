'use client';

// One saved message in the thread. Assistant turns round-trip through the pure
// parsers: thinking above the answer, source strip, markdown body, images.
// Memoized so a streaming turn does not re-parse the finished history.

import { memo } from 'react';
import { parseSourcesFromContent, parseThinking } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import { imgSrc, type ChatMessage } from './store';

export function ImageSkeleton() {
  return (
    <div className="mt-3 w-72 max-w-full h-48 rounded-lg border border-white/10 bg-white/[0.03] animate-pulse flex items-center justify-center">
      <span className="pixel-sans text-[10px] uppercase tracking-[0.14em] text-white/35">rendering image</span>
    </div>
  );
}

function Message({ msg, pendingImage }: { msg: ChatMessage; pendingImage?: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="l2-rise flex justify-end">
        <div className="max-w-[85%] md:max-w-[75%] px-4 py-2 bg-white/[0.05] border border-white/10 rounded-lg rounded-br-[4px]">
          {msg.images && msg.images.length > 0 && (
            <div className="flex flex-wrap gap-2 my-1.5">
              {msg.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={imgSrc(img)} alt="attached" className="max-w-[168px] max-h-[168px] rounded-md object-cover border border-white/10" />
              ))}
            </div>
          )}
          {msg.content && (
            <p className="pixel-sans text-[15px] leading-[1.65] text-white/90 whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>
      </div>
    );
  }

  const { cleanContent, sources } = parseSourcesFromContent(msg.content);
  const { thinking, response, thinkSeconds } = parseThinking(cleanContent);

  return (
    <div className="l2-rise">
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
            <img key={i} src={imgSrc(img)} alt="generated" className="max-w-[360px] w-full max-h-[360px] object-contain rounded-lg border border-white/10" />
          ))}
        </div>
      )}
      {pendingImage && <ImageSkeleton />}
    </div>
  );
}

export default memo(Message);

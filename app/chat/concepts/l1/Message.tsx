'use client';

// One saved message on the page. The user's words sit in a soft warm-tinted
// surface on the right; the assistant's answer is bare ink on the paper.
// Assistant turns round-trip through the pure parsers: thinking above the
// answer, source strip, markdown body, images.

import { parseSourcesFromContent, parseThinking } from '../../lib';
import { MessageMarkdown, SourceStrip } from '../../components/MarkdownContent';
import ThinkingDropdown from '../../components/ThinkingDropdown';
import { imgSrc, type Msg } from './store';

export function ImageSkeleton() {
  return (
    <div className="mt-3 w-72 max-w-full h-44 rounded-xl border ln-hair ln-shimmer flex items-center justify-center">
      <span className="pixel-sans text-[11px] ln-ghost">rendering the image</span>
    </div>
  );
}

export default function MessageView({ msg, pendingImage }: { msg: Msg; pendingImage?: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="ln-enter flex justify-end">
        <div className="max-w-[85%] md:max-w-[75%] px-4 py-2.5 ln-bg-tint rounded-[1.15rem] rounded-br-[0.4rem]">
          {msg.images && msg.images.length > 0 && (
            <div className="flex flex-wrap gap-2 my-1.5">
              {msg.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={imgSrc(img)} alt="attached" className="max-w-[180px] max-h-[180px] rounded-lg object-cover border ln-hair" />
              ))}
            </div>
          )}
          {msg.content && (
            <p className="pixel-sans text-[15.5px] leading-[1.65] ln-ink whitespace-pre-wrap break-words">{msg.content}</p>
          )}
        </div>
      </div>
    );
  }

  const { cleanContent, sources } = parseSourcesFromContent(msg.content);
  const { thinking, response, thinkSeconds } = parseThinking(cleanContent);

  return (
    <div className="ln-enter">
      {thinking && (
        <div className="ln-think mb-2">
          <ThinkingDropdown thinking={thinking} elapsedSeconds={thinkSeconds ?? undefined} />
        </div>
      )}
      {sources.length > 0 && (
        <div className="ln-sources">
          <SourceStrip sources={sources} content={response} />
        </div>
      )}
      {response && <MessageMarkdown content={response} sources={sources} />}
      {msg.images && msg.images.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-3">
          {msg.images.map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={imgSrc(img)} alt="generated" className="max-w-[360px] w-full max-h-[360px] object-contain rounded-xl border ln-hair" />
          ))}
        </div>
      )}
      {pendingImage && <ImageSkeleton />}
    </div>
  );
}

'use client';

// Markdown rendering for chat messages: KaTeX math (via encoded custom tags),
// inline [n] citations, and the source strip shown above web-search answers.

import Markdown from 'markdown-to-jsx';
import katex from 'katex';
// KaTeX positions every glyph from its own stylesheet. Without this import
// the math renders as invisible, absurdly wide, horizontally scrolling spans.
import 'katex/dist/katex.min.css';
import { SourceRef, decodeTex, getUsedSources, mathToTags } from '../lib';

// Render inline citations [1], [2] etc. as superscript links
function CitationText({ text, sources }: { text: string; sources: SourceRef[] }) {
  if (sources.length === 0) return <>{text}</>;
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/);
        if (match) {
          const idx = parseInt(match[1], 10) - 1;
          const source = sources[idx];
          if (source) {
            const domain = (() => { try { return new URL(source.url).hostname.replace('www.', ''); } catch { return ''; } })();
            return (
              <a key={i} href={source.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-medium bg-fg/10 hover:bg-fg/20 text-fg-60 hover:text-fg rounded-full no-underline align-super ml-0.5 mr-0.5 transition-colors cursor-pointer"
                title={`${source.title} (${domain})`}>{match[1]}</a>
            );
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function renderKatex(tex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch {
    return null;
  }
}

function MathInline({ 'data-tex': enc }: { 'data-tex'?: string }) {
  const tex = decodeTex(enc || '');
  const html = renderKatex(tex, false);
  if (html === null) return <span>{tex}</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function MathBlock({ 'data-tex': enc }: { 'data-tex'?: string }) {
  const tex = decodeTex(enc || '');
  const html = renderKatex(tex, true);
  if (html === null) return <div>{tex}</div>;
  return <div className="my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Build markdown components that inject KaTeX math and citation rendering
function buildMarkdownOverrides(sources: SourceRef[]) {
  const mathOverrides = {
    mathinline: { component: MathInline },
    mathblock: { component: MathBlock },
  };
  if (sources.length === 0) return { overrides: mathOverrides };
  const proc = (child: React.ReactNode): React.ReactNode => typeof child === 'string' ? <CitationText text={child} sources={sources} /> : child;
  return {
    overrides: {
      ...mathOverrides,
      p: { component: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{Array.isArray(children) ? children.map((c: React.ReactNode, i: number) => <span key={i}>{proc(c)}</span>) : proc(children)}</p> },
      li: { component: ({ children, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => <li {...props}>{Array.isArray(children) ? children.map((c: React.ReactNode, i: number) => <span key={i}>{proc(c)}</span>) : proc(children)}</li> },
    },
  };
}

// Source strip shown above the response
export function SourceStrip({ sources, content }: { sources: SourceRef[]; content?: string }) {
  if (sources.length === 0) return null;
  const displayed = content ? getUsedSources(content, sources) : sources.map((s, i) => ({ source: s, originalIndex: i }));
  if (displayed.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {displayed.map(({ source: s, originalIndex: i }) => {
        const domain = (() => { try { return new URL(s.url).hostname.replace('www.', ''); } catch { return ''; } })();
        return (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
            className="cursor-pointer flex items-center gap-1.5 px-2 py-1 bg-fg/[0.04] border border-fg/[0.08] hover:border-fg/15 hover:bg-[var(--chat-row-on)] transition-colors rounded-md group">
            <span className="flex items-center justify-center w-3.5 h-3.5 text-[9px] font-medium bg-fg/10 text-fg-70 rounded-full flex-shrink-0">{i + 1}</span>
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`} alt="" width={12} height={12} className="flex-shrink-0 opacity-50 group-hover:opacity-80" />
            <span className="pixel-sans text-fg-70 text-[11px] truncate max-w-[100px] group-hover:text-fg-70">{s.title || domain}</span>
          </a>
        );
      })}
    </div>
  );
}

// The tuned typography wrapper every message body renders through. One place
// so the finished and streaming views can never drift apart.
const PROSE_CLASSES = 'chat-answer pixel-sans text-fg-90 text-base leading-[1.75] prose prose-invert prose-base max-w-none prose-p:my-3 prose-li:my-1 prose-ol:my-3 prose-ul:my-3 prose-headings:mt-5 prose-headings:mb-2 prose-headings:text-fg prose-headings:font-semibold prose-strong:text-fg prose-strong:font-extrabold prose-code:text-fg-80 prose-code:bg-[var(--chat-row-on)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-a:text-steel prose-a:no-underline hover:prose-a:underline prose-hr:my-5 prose-hr:border-fg/10 [&_br]:block [&_br]:content-[\'\'] [&_br]:mt-2.5';

export function MessageMarkdown({ content, sources, trailing }: { content: string; sources: SourceRef[]; trailing?: React.ReactNode }) {
  return (
    <div className={PROSE_CLASSES}>
      <Markdown options={buildMarkdownOverrides(sources)}>{mathToTags(content)}</Markdown>
      {trailing}
    </div>
  );
}

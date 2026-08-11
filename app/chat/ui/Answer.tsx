'use client';

// The answer body, owned by this chat.
//
// The old renderer wore three layers of dead skin: `prose-*` utilities from a
// typography plugin that is not registered in this app, plus the legacy
// `chat-answer` and `pixel-sans` classes with their own rules in globals.css.
// Nothing here carries any of that. Structure comes from the overrides below,
// every pixel of style from `.cu-answer` in ui.css.
import { createElement, useState } from 'react';
import Markdown from 'markdown-to-jsx';
import katex from 'katex';
// KaTeX positions every glyph from its own stylesheet.
import 'katex/dist/katex.min.css';
import { decodeTex, getUsedSources, mathToTags, type SourceRef } from '../lib';
import { stripMachinePrefix } from '@/lib/strip-machine-prefix';
import { Copy, Check } from './Icons';

/* ---------- math ---------- */

function renderKatex(tex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(tex, { throwOnError: false, displayMode });
  } catch {
    return null;
  }
}

function MathInline({ 'data-tex': enc }: { 'data-tex'?: string }) {
  const tex = decodeTex(enc ?? '');
  const html = renderKatex(tex, false);
  if (html === null) return <code>{tex}</code>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function MathBlock({ 'data-tex': enc }: { 'data-tex'?: string }) {
  const tex = decodeTex(enc ?? '');
  const html = renderKatex(tex, true);
  if (html === null) return <pre>{tex}</pre>;
  // the scroller is the wrapper, so a wide equation never widens the column
  return <div className="cu-math" dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- code ---------- */

function langOf(child: unknown): string {
  const cls = (child as { props?: { className?: string } })?.props?.className ?? '';
  const m = /lang-([\w+#-]+)/.exec(cls);
  return m ? m[1] : '';
}

function textOf(node: unknown): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  const kids = (node as { props?: { children?: unknown } })?.props?.children;
  return kids === undefined ? '' : textOf(kids);
}

/** A code block carries its own copy button, revealed on hover. */
function CodeBlock({ children }: { children?: React.ReactNode }) {
  const [done, setDone] = useState(false);
  const lang = langOf(Array.isArray(children) ? children[0] : children);
  const source = textOf(children).replace(/\n$/, '');

  return (
    <div className="cu-code group/code">
      <div className="cu-code-bar">
        <span>{lang}</span>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(source);
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          }}
          className="cu-code-copy"
        >
          {done ? <Check /> : <Copy />}
          {done ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

/* ---------- tables ---------- */

/** The scroller is a wrapper, never the table itself: making the table a block
 *  to scroll it is what was clipping its last row border. */
function Table({ children, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="cu-tablewrap">
      <table {...props}>{children}</table>
    </div>
  );
}

/* ---------- citations ---------- */

function Cited({ text, sources }: { text: string; sources: SourceRef[] }) {
  if (sources.length === 0) return <>{text}</>;
  return (
    <>
      {text.split(/(\[\d+\])/g).map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        const src = m ? sources[parseInt(m[1], 10) - 1] : undefined;
        if (!m || !src) return <span key={i}>{part}</span>;
        return (
          <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" className="cu-cite" title={src.title}>
            {m[1]}
          </a>
        );
      })}
    </>
  );
}

/* ---------- the renderer ---------- */

/** Answers are worker output, and a worker is anyone on a permissionless
 *  network. markdown-to-jsx escapes `<script>`/`<iframe>` and drops
 *  `javascript:` URLs, but raw `<form>` and inline `style` come through as live
 *  DOM — enough to paint a fixed full-viewport overlay or a "session expired,
 *  sign in again" form posting to another host, inside this app's own chrome.
 *  Stripping `style` also restores this file's stated contract that every pixel
 *  of style comes from `.cu-answer`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const safeCreateElement = (tag: any, props: any, ...children: any[]) => {
  if (props && props.style !== undefined) {
    const rest = { ...props };
    delete rest.style;
    return createElement(tag, rest, ...children);
  }
  return createElement(tag, props, ...children);
};

function overrides(sources: SourceRef[]) {
  const base = {
    mathinline: { component: MathInline },
    mathblock: { component: MathBlock },
    pre: { component: CodeBlock },
    table: { component: Table },
    // Answers never legitimately contain a form. Render the shell as a plain
    // block and drop the fields, so nothing can collect a keystroke.
    form: { component: 'div' as const },
    input: { component: () => null },
    textarea: { component: () => null },
    button: { component: 'span' as const },
  };
  if (sources.length === 0) return { overrides: base, createElement: safeCreateElement };

  const withCites = (children: React.ReactNode) =>
    Array.isArray(children)
      // Only strings become citation spans. Wrapping every child meant a nested
      // <ul> inside an <li> ended up inside an inline <span>, which stopped
      // `.cu-answer li > ul` matching and lost the sub-list spacing.
      ? children.map((c, i) => (typeof c === 'string' ? <Cited key={i} text={c} sources={sources} /> : c))
      : (typeof children === 'string' ? <Cited text={children} sources={sources} /> : children);

  return {
    createElement: safeCreateElement,
    overrides: {
      ...base,
      p: { component: ({ children, ...p }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...p}>{withCites(children)}</p> },
      li: { component: ({ children, ...p }: React.LiHTMLAttributes<HTMLLIElement>) => <li {...p}>{withCites(children)}</li> },
    },
  };
}

export function AnswerBody({ content, sources, trailing }: { content: string; sources: SourceRef[]; trailing?: React.ReactNode }) {
  return (
    <div className="cu-answer" data-answer>
      <Markdown options={overrides(sources)}>{mathToTags(stripMachinePrefix(content))}</Markdown>
      {trailing}
    </div>
  );
}

/** The sources actually cited, as quiet chips above the answer. */
export function SourceStrip({ sources, content }: { sources: SourceRef[]; content?: string }) {
  if (sources.length === 0) return null;
  const shown = content ? getUsedSources(content, sources) : sources.map((s, i) => ({ source: s, originalIndex: i }));
  if (shown.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {shown.map(({ source: s, originalIndex: i }) => {
        const domain = (() => { try { return new URL(s.url).hostname.replace('www.', ''); } catch { return ''; } })();
        return (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="cu-src" title={s.title || domain}>
            <span className="cu-src-n">{i + 1}</span>
            <span className="truncate">{s.title || domain}</span>
          </a>
        );
      })}
    </div>
  );
}

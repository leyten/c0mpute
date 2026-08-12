'use client';

// User: a soft filled bubble, right-aligned, no border, no label.
// Assistant: bare text on the page, no avatar, no name repeated every turn.
//
// An assistant turn can hold several answers to the same prompt. One quiet row
// under it flips between them, asks for another one, asks a different model for
// one, puts two of them side by side, and carries the follow-ups on the last
// answer. Your own bubble reveals Edit on hover, parked outside the bubble so
// the thread's rhythm never moves in either state.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnswerBody, SourceStrip } from './Answer';
import ThinkingDropdown from '../components/ThinkingDropdown';
import { parseSourcesFromContent, parseThinking, type Plan, type SourceRef } from '../lib';
import type { ChatEngine } from '../engine/useChatEngine';
import { activeIndex, versionsOf, type Msg, type Version } from './store';
import ModelMenu from './ModelMenu';
import { Copy, Check, File as FileIcon, Pencil, Refresh, Swap, Split, Left, Right } from './Icons';

/** Every control in a turn is quiet: invisible until the turn is hovered, and
 *  reachable anyway by keyboard and on devices with no hover to give (cu-quiet
 *  in ui.css). */
const QUIET = 'cu-quiet opacity-0 transition-all duration-150 focus-visible:opacity-100 group-hover:opacity-100';

/** A generated document, offered under the answer that produced it. */
const CHIP = 'cu-chip flex items-center gap-2 px-3 py-1.5 text-[13px]';

/** What the running job looks like from a turn's point of view. */
export interface LiveState {
  text: string;
  state: 'queued' | 'streaming';
  queue: number | null;
  searching: boolean;
  generatingImage: boolean;
  /** Reported by the job before the text carries them. */
  sources?: SourceRef[];
}

function Answer({ content, streaming, liveSources }: { content: string; streaming?: boolean; liveSources?: SourceRef[] }) {
  const parsed = parseSourcesFromContent(content);
  const cleanContent = parsed.cleanContent;
  // while streaming the ---SOURCES--- tail has not been written yet, so take
  // what the job has already reported
  const sources = parsed.sources.length ? parsed.sources : (liveSources ?? []);
  const { thinking, response, thinkSeconds } = parseThinking(cleanContent);
  const stillThinking = streaming && thinking !== null && !response.trim();

  return (
    <div className="cu-answer-wrap wrap-anywhere">
      {sources.length > 0 && <SourceStrip sources={sources} content={cleanContent} />}
      {thinking !== null && (
        <div className="mb-3">
          <ThinkingDropdown thinking={thinking} isStreaming={stillThinking} elapsedSeconds={thinkSeconds ?? undefined} />
        </div>
      )}
      {(response.trim() || !thinking) && (
        // data-answer marks the answer itself: a quote comes from what was
        // said, never from the reasoning or the source strip around it
        <AnswerBody
          content={response}
          sources={sources}
          trailing={streaming ? <span className="cu-caret" /> : undefined}
        />
      )}
    </div>
  );
}

/** Whether the thread scroller was sitting at the end the last time anyone
 *  looked. Sampled on scroll — and an image growing into place fires no scroll
 *  event — so the reading survives the reflow it has to be judged against. */
const atEnd = new WeakMap<Element, boolean>();

/** A picture in the thread. A data URL carries no intrinsic size, so the turn
 *  measures as if the image were not there: the scroller is sent to the bottom,
 *  arrives, and then the pictures decode and push the bottom hundreds of pixels
 *  further down. Nothing put it right, because the scroller only re-measures
 *  when the reader scrolls — a conversation with images in it opened mid-thread
 *  and not even the jump button appeared. Each image pulls the thread back to
 *  the end as it lands, and only if the reader was already at the end, so
 *  having scrolled up is never undone. */
function ThreadImage({ src, className }: { src: string; className: string }) {
  const img = useRef<HTMLImageElement>(null);

  // watched from mount rather than from the first load: a reader who scrolls up
  // while the pictures are still decoding has to be seen doing it
  useEffect(() => {
    const el = img.current?.closest('.cu-scroll');
    if (!el || atEnd.has(el)) return;
    atEnd.set(el, true);
    el.addEventListener('scroll', () => {
      atEnd.set(el, el.scrollHeight - el.scrollTop - el.clientHeight < 120);
    }, { passive: true });
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={img}
      src={src}
      alt=""
      className={className}
      onLoad={e => {
        const el = e.currentTarget.closest('.cu-scroll');
        // the correction is a scroll of its own, which is what finally lets the
        // page recompute the jump button off a height that is now true
        if (el && atEnd.get(el) !== false) el.scrollTop = el.scrollHeight;
      }}
    />
  );
}

/** One answer: its text, then whatever it generated. */
function VersionBody({ v }: { v: Version }) {
  return (
    <>
      <Answer content={v.content} />
      {v.pendingImage && (
        <div className="mt-3 h-64 w-full max-w-sm animate-pulse rounded-2xl" style={{ background: 'var(--cu-surface)' }} />
      )}
      {v.images && v.images.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.images.map((src, i) => (
            <ThreadImage key={i} src={src} className="max-h-96 max-w-full rounded-2xl" />
          ))}
        </div>
      )}
      {v.files && v.files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.files.map((f, i) => (f.data ? (
            <a key={i} href={f.data} download={f.name} className={CHIP} style={{ color: 'var(--cu-dim)' }}>
              <FileIcon />
              {f.name}
            </a>
          ) : (
            // the download did not survive the reload, but the turn should
            // still show what it produced
            <span key={i} className={`${CHIP} opacity-40`} style={{ color: 'var(--cu-faint)' }} title="Ask again to download this">
              <FileIcon />
              {f.name}
            </span>
          )))}
        </div>
      )}
    </>
  );
}

function CopyButton({ text, always }: { text: string; always?: boolean }) {
  const [done, setDone] = useState(false);
  // the reset outlives the button otherwise: copy an answer, switch
  // conversations inside 1.6s, and it fires into a turn that is gone
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  return (
    <button
      onClick={() => {
        const { cleanContent } = parseSourcesFromContent(text);
        const { response } = parseThinking(cleanContent);
        void navigator.clipboard.writeText(response.trim() || cleanContent);
        setDone(true);
        if (reset.current) clearTimeout(reset.current);
        reset.current = setTimeout(() => setDone(false), 1600);
      }}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] transition-all duration-150 hover:bg-[var(--chat-row-on)] ${always ? '' : QUIET}`}
      style={{ color: 'var(--cu-faint)' }}
    >
      {done ? <Check /> : <Copy />}
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

/** Your own prompt, copied verbatim. */
function PlainCopy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const reset = useRef<ReturnType<typeof setTimeout> | null>(null);
  // above the early return: the hooks have to run on every render of this
  // component, including the one where there is nothing to copy
  useEffect(() => () => { if (reset.current) clearTimeout(reset.current); }, []);
  if (!text) return null;
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setDone(true);
        if (reset.current) clearTimeout(reset.current);
        reset.current = setTimeout(() => setDone(false), 1600);
      }}
      title="Copy"
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] hover:bg-[var(--chat-row-on)] ${QUIET}`}
      style={{ color: 'var(--cu-faint)' }}
    >
      {done ? <Check /> : <Copy />}
      <span className="hidden sm:inline">{done ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

/** Same weight as Copy: silent until the turn is hovered, 12px, faint. */
function Action({
  icon, label, onClick, disabled, held, always,
}: {
  icon: ReactNode;
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  held?: boolean;
  always?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] transition-all duration-150 hover:bg-[var(--chat-row-on)] ${
        held || always
          ? 'opacity-100 disabled:opacity-30'
          // hidden means hidden: a disabled button must not ghost at 30% while
          // the turn is unhovered
          : `${QUIET} disabled:opacity-0 group-hover:disabled:opacity-30`
      }`}
      style={{ color: held ? 'var(--cu-dim)' : 'var(--cu-faint)' }}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

// Follow-ups read the answer and offer the three moves that make sense for it.
// Derived, never generated: no model call, no guessing, same answer every time.
type FollowUp = { label: string; text: string };

const GENERIC: FollowUp[] = [
  { label: 'Explain simply', text: 'Explain that more simply.' },
  { label: 'Go deeper', text: 'Go deeper on that.' },
  { label: 'Give an example', text: 'Give me a concrete example.' },
];

export function followUpsFor(content: string): FollowUp[] {
  const out: FollowUp[] = [];
  const add = (f: FollowUp) => { if (!out.some(x => x.label === f.label) && out.length < 3) out.push(f); };

  const hasCode = /```/.test(content);
  const hasMath = /<mathblock|<mathinline|\$\$/.test(content);
  const hasTable = /\n\s*\|.+\|/.test(content);
  const hasSteps = /\n\s*\d+\.\s/.test(content);
  const hasCites = /\[\d+\]/.test(content);
  const long = content.length > 1400;

  if (hasCode) {
    add({ label: 'Explain the code', text: 'Walk me through that code line by line.' });
    add({ label: 'Handle errors', text: 'Add error handling to that code.' });
    add({ label: 'Write a test', text: 'Write a test for that code.' });
  }
  if (hasMath) {
    add({ label: 'Show the derivation', text: 'Show the derivation step by step.' });
    add({ label: 'Work an example', text: 'Work through a concrete numeric example.' });
  }
  if (hasTable) add({ label: 'Sum it up', text: 'Summarise what that table shows.' });
  if (hasSteps) add({ label: 'Expand step one', text: 'Expand on the first step in detail.' });
  if (hasCites) add({ label: 'Check the sources', text: 'What do the sources actually say, and how strong are they?' });
  if (long) add({ label: 'Shorter', text: 'Give me the short version.' });

  for (const g of GENERIC) add(g);
  return out.slice(0, 3);
}

const CONTINUE = 'Continue from where you stopped.';

export function FollowUps({ content, truncated, onPick }: { content: string; truncated?: boolean; onPick: (text: string) => void }) {
  const chip = 'cu-chip px-2.5 py-1 text-[12px]';
  return (
    <>
      {truncated && (
        <button onClick={() => onPick(CONTINUE)} className={chip} style={{ color: 'var(--cu-faint)' }}>
          Continue
        </button>
      )}
      {followUpsFor(content).map(f => (
        <button key={f.label} onClick={() => onPick(f.text)} className={chip} style={{ color: 'var(--cu-faint)' }}>
          {f.label}
        </button>
      ))}
    </>
  );
}

function Pager({ index, count, onPick }: { index: number; count: number; onPick: (i: number) => void }) {
  const step = 'grid h-6 w-6 place-items-center rounded-lg transition-colors hover:bg-[var(--chat-row-on)] disabled:pointer-events-none disabled:opacity-30';
  return (
    <div className="flex items-center gap-0.5 pl-1 text-[12px] tabular-nums" style={{ color: 'var(--cu-faint)' }}>
      <button onClick={() => onPick(index - 1)} disabled={index === 0} className={step} aria-label="Previous answer"><Left /></button>
      <span>{index + 1}/{count}</span>
      <button onClick={() => onPick(index + 1)} disabled={index === count - 1} className={step} aria-label="Next answer"><Right /></button>
    </div>
  );
}

/** Which model wrote this answer. Kept out of the way until there is more than
 *  one answer to tell apart, or until the turn is hovered. */
function Provenance({ version, always }: { version: Version; always: boolean }) {
  if (!version.model) return null;
  return (
    <span
      className={`pl-1.5 text-[12px] transition-opacity duration-150 ${always ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      style={{ color: 'var(--cu-faint)' }}
    >
      {version.model.name} · {version.model.costLabel}
    </span>
  );
}

/** Two answers next to each other on a wide screen, stacked on a narrow one.
 *  The one in the conversation reads a step brighter than the alternative. */
function CompareView({ versions, index, onPick }: { versions: Version[]; index: number; onPick: (i: number) => void }) {
  const other = (index + 1) % versions.length;
  return (
    <div className="grid gap-7 md:grid-cols-2">
      <ComparePane v={versions[index]} n={index + 1} current />
      <ComparePane v={versions[other]} n={other + 1} onUse={() => onPick(other)} />
    </div>
  );
}

function ComparePane({ v, n, current, onUse }: { v: Version; n: number; current?: boolean; onUse?: () => void }) {
  return (
    <div className="min-w-0">
      <div className="mb-2.5 flex items-center gap-2 text-[12px]" style={{ color: current ? 'var(--cu-dim)' : 'var(--cu-faint)' }}>
        <span className="truncate">{n}. {v.model ? `${v.model.name} · ${v.model.costLabel}` : 'Answer'}</span>
        {onUse && (
          <button
            onClick={onUse}
            className={`ml-auto shrink-0 rounded-lg px-2 py-0.5 hover:bg-[var(--chat-row-on)] ${QUIET}`}
          >Use this one</button>
        )}
      </div>
      <VersionBody v={v} />
    </div>
  );
}

// The bubble in place, same 20px geometry, now typeable. Enter sends,
// Shift+Enter breaks the line, Escape leaves the message as it was.
function EditBubble({
  initial, canSend, hasImages, onCancel, onSubmit,
}: {
  initial: string;
  /** False while a job is running: the engine takes one at a time. */
  canSend: boolean;
  /** An image-only message is still worth resending with no text at all. */
  hasImages: boolean;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 320) + 'px';
  }, [text]);

  const can = (text.trim().length > 0 || hasImages) && canSend;

  return (
    <div>
      <textarea
        ref={ta}
        rows={1}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (can) onSubmit(text.trim());
          }
        }}
        className="cu-scroll block w-full resize-none rounded-[20px] px-4 py-2.5 text-[16px] leading-[1.6] outline-none"
        style={{ background: 'var(--cu-surface)', color: 'var(--cu-text)' }}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-[13px] transition-colors hover:bg-[var(--chat-row-on)]"
          style={{ color: 'var(--cu-faint)' }}
        >
          Cancel
        </button>
        <button
          onClick={() => { if (can) onSubmit(text.trim()); }}
          disabled={!can}
          className="rounded-full bg-fg px-3.5 py-1.5 text-[13px] text-on-fg transition-all active:scale-95 disabled:bg-fg/[0.09] disabled:text-fg-30"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export function Turn({
  msg, engine, busy, live, editable, editing, onEdit, onCancelEdit, onResend, onRegenerate, onPick, trailing,
}: {
  msg: Msg;
  engine: ChatEngine;
  busy: boolean;
  /** Set while this turn is the one being written. */
  live?: LiveState;
  /** User turns only: offer Edit. Off while a job is running. */
  editable?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onResend?: (text: string) => void;
  /** Assistant turns only. No plan means the model that wrote this answer. */
  onRegenerate: (plan?: Plan) => void;
  onPick: (index: number) => void;
  /** Assistant turns only: extra controls beside Copy. */
  trailing?: ReactNode;
}) {
  return msg.role === 'user'
    ? (
      <UserTurn
        msg={msg}
        editable={editable}
        editing={editing}
        onEdit={onEdit}
        onCancelEdit={onCancelEdit}
        onResend={onResend}
      />
    )
    : (
      <AssistantTurn
        msg={msg}
        engine={engine}
        busy={busy}
        live={live}
        onRegenerate={onRegenerate}
        onPick={onPick}
        trailing={trailing}
      />
    );
}

function UserTurn({
  msg, editable, editing, onEdit, onCancelEdit, onResend,
}: {
  msg: Msg;
  editable?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onCancelEdit?: () => void;
  onResend?: (text: string) => void;
}) {
  const images = msg.images ?? [];
  return (
    <div className="cu-fade group flex justify-end">
      {/* the bubble sizes itself exactly as before; `relative` only gives the
          Edit button something to hang off, and editing takes the full
          measure so there is room to type */}
      <div className={editing ? 'relative w-full max-w-[80%]' : 'relative max-w-[80%]'}>
        {images.length > 0 && (
          <div className="mb-2 flex flex-wrap justify-end gap-2">
            {images.map((src, i) => (
              <ThreadImage key={i} src={src} className="max-h-52 rounded-2xl" />
            ))}
          </div>
        )}

        {editing && onResend && onCancelEdit ? (
          <EditBubble
            initial={msg.content}
            canSend={!!editable}
            hasImages={images.length > 0}
            onCancel={onCancelEdit}
            onSubmit={onResend}
          />
        ) : (
          <>
            {msg.content && (
              <div
                className="wrap-anywhere whitespace-pre-wrap rounded-[20px] px-4 py-2.5 text-[16px] leading-[1.6]"
                style={{ background: 'var(--cu-surface)', color: 'var(--cu-text)' }}
              >
                {msg.content}
              </div>
            )}
            {/* parked outside the bubble: revealed on hover, and they cost
                the thread no vertical space in either state */}
            <div className="absolute right-full top-1/2 mr-1 flex -translate-y-1/2 items-center gap-0.5">
              <PlainCopy text={msg.content} />
              {editable && onEdit && (
                <button
                  onClick={onEdit}
                  title="Edit"
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] hover:bg-[var(--chat-row-on)] ${QUIET}`}
                  style={{ color: 'var(--cu-faint)' }}
                >
                  <Pencil />
                  <span className="hidden sm:inline">Edit</span>
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AssistantTurn({
  msg, engine, busy, live, onRegenerate, onPick, trailing,
}: {
  msg: Msg;
  engine: ChatEngine;
  busy: boolean;
  live?: LiveState;
  onRegenerate: (plan?: Plan) => void;
  onPick: (index: number) => void;
  trailing?: ReactNode;
}) {
  // the last answer carries the follow-ups, and keeps its actions on screen:
  // a hover-only row sitting above always-visible chips left a gap that reads
  // as a mistake when the cursor is elsewhere
  const live0 = !!trailing;
  const [menu, setMenu] = useState(false);
  const [placement, setPlacement] = useState<'up' | 'down'>('up');
  const [compare, setCompare] = useState(false);

  const versions = versionsOf(msg);
  const index = activeIndex(msg);
  const current = versions[index];
  const many = versions.length > 1;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      // scoped to this answer: every answer in the thread carries the marker, so
      // a bare attribute selector was satisfied by a sibling's, and opening the
      // menu on one answer then clicking another's left the first one hanging
      // open over the conversation
      const owner = (e.target as HTMLElement).closest('[data-answer-menu]');
      if (owner?.getAttribute('data-answer-menu') !== msg.id) setMenu(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu, msg.id]);

  return (
    <div className="cu-fade group relative">
      {live
        ? <Live text={live.text} state={live.state} queue={live.queue} searching={live.searching} generatingImage={live.generatingImage} sources={live.sources} />
        : compare && many
          ? <CompareView versions={versions} index={index} onPick={onPick} />
          : <VersionBody v={current} />}

      {!live && (
        // Bottom left of the answer, floating: the controls reserve no space
        // and appear only while the answer is hovered. The follow-ups do not
        // live here at all — they belong to the composer, above the box you
        // would type the follow-up into.
        <div className="pointer-events-none absolute left-0 top-full -ml-2 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 opacity-0 transition-opacity duration-150 [&>*]:pointer-events-auto group-hover:opacity-100 group-focus-within:opacity-100">
          {many && <Pager index={index} count={versions.length} onPick={onPick} />}

          <CopyButton text={current.content} always />

          <Action
            icon={<Refresh />}
            label="Regenerate"
            disabled={busy}
            always
            onClick={() => onRegenerate()}
          />

          <div className="relative" data-answer-menu={msg.id}>
            <Action
              icon={<Swap />}
              label="Another model"
              disabled={busy}
              always
              held={menu}
              onClick={e => {
                const box = e.currentTarget.getBoundingClientRect();
                setPlacement(box.top < window.innerHeight / 2 ? 'down' : 'up');
                setMenu(v => !v);
              }}
            />
            {menu && (
              <ModelMenu
                engine={engine}
                selectedId={current.model?.id ?? null}
                placement={placement}
                onPick={m => { setMenu(false); onRegenerate(m); }}
              />
            )}
          </div>

          {many && (
            <Action
              icon={<Split />}
              label={compare ? 'One at a time' : 'Compare'}
              always
              held={compare}
              onClick={() => setCompare(v => !v)}
            />
          )}

          <Provenance version={current} always />
        </div>
      )}
    </div>
  );
}

export function Live({
  text, state, queue, searching, generatingImage, sources,
}: {
  text: string;
  state: 'queued' | 'streaming';
  queue: number | null;
  searching: boolean;
  generatingImage: boolean;
  /** Arrive before the text; shown as they land so the strip does not appear
   *  all at once when the answer completes. */
  sources?: SourceRef[];
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

      {(sources?.length ?? 0) > 0 && !text && <SourceStrip sources={sources!} />}

      {text && <Answer content={text} streaming liveSources={sources} />}

      {generatingImage && (
        <div className="mt-3 h-64 w-full max-w-sm animate-pulse rounded-2xl" style={{ background: 'var(--cu-surface)' }} />
      )}
    </div>
  );
}

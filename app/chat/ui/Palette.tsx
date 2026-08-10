'use client';

// Cmd/Ctrl+K. Everything the interface can do, reachable by typing: jump to a
// conversation (titles and message bodies both), switch model, toggle
// thinking, answer the last turn again, edit the last message, edit the
// conversation's instructions, rename, delete, account, pages. Centred panel
// on desktop, bottom sheet on mobile, fades only.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import type { Plan } from '../lib';
import type { ChatEngine } from '../engine/useChatEngine';
import { fuzzyScore, searchConvos, type Snippet } from './search';
import type { Convo } from './store';
import { Check, Search } from './Icons';

/** One row. The list is plain data, so new commands are one entry to append. */
interface PaletteItem {
  id: string;
  /** group heading; rows are rendered in the order they are pushed */
  section: string;
  label: string;
  /** quiet trailing word on the same line */
  hint?: string;
  /** second line: worker counts, model description */
  detail?: string;
  snippet?: Snippet | null;
  checked?: boolean;
  disabled?: boolean;
  danger?: boolean;
  launching?: boolean;
  run?: () => void;
}

// Mounted only while it is open, so every opening starts from clean state.
export default function Palette({
  onClose, engine, convos, activeId, plan, onPlan, think, onThink,
  hasInstructions, onEditInstructions, canAskAgain, onAskAgain, canEditLast, onEditLast,
  onSelect, onNew, onRename, onDelete,
}: {
  onClose: () => void;
  engine: ChatEngine;
  convos: Convo[];
  activeId: string | null;
  plan: Plan;
  onPlan: (p: Plan) => void;
  think: boolean;
  onThink: (v: boolean) => void;
  hasInstructions: boolean;
  onEditInstructions: () => void;
  /** There is an answer to write again, and nothing running. */
  canAskAgain: boolean;
  /** No plan means the model that wrote the answer on screen. */
  onAskAgain: (plan?: Plan) => void;
  canEditLast: boolean;
  onEditLast: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const active = convos.find(c => c.id === activeId) ?? null;

  useEffect(() => { input.current?.focus(); }, []);

  const onQuery = (v: string) => { setQuery(v); setIndex(0); setConfirmDelete(false); };

  const go = useCallback((href: string) => { window.location.href = href; }, []);

  // The corpus scan parses every message of every conversation, so it hangs off
  // the query and the conversations and nothing else. The page re-renders about
  // ten times a second while an answer streams and none of that changes a hit.
  const hits = useMemo(() => searchConvos(query.trim(), convos), [query, convos]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim();
    const out: PaletteItem[] = [];

    // conversations, titles and bodies
    for (const h of (q ? hits.slice(0, 12) : hits.slice(0, 6))) {
      out.push({
        id: `c:${h.convo.id}`,
        section: 'Conversations',
        label: h.convo.title,
        hint: h.convo.id === activeId ? 'current' : undefined,
        snippet: h.snippet,
        run: () => { onSelect(h.convo.id); onClose(); },
      });
    }

    // actions
    const actions: PaletteItem[] = [
      { id: 'a:new', section: 'Actions', label: 'New conversation', run: () => { onNew(); onClose(); } },
    ];
    if (canAskAgain) {
      actions.push({
        id: 'a:regen',
        section: 'Actions',
        label: 'Regenerate the last answer',
        run: () => { onAskAgain(); onClose(); },
      });
    }
    if (canEditLast) {
      actions.push({
        id: 'a:edit',
        section: 'Actions',
        label: 'Edit the last message',
        run: () => { onEditLast(); onClose(); },
      });
    }
    actions.push({
      id: 'a:instr',
      section: 'Actions',
      label: hasInstructions ? 'Edit the instructions for this conversation' : 'Add instructions for this conversation',
      hint: hasInstructions ? 'set' : undefined,
      run: () => { onEditInstructions(); onClose(); },
    });
    if (plan.thinking) {
      actions.push({
        id: 'a:think',
        section: 'Actions',
        label: think ? 'Turn thinking off' : 'Turn thinking on',
        run: () => { onThink(!think); onClose(); },
      });
    }
    if (active) {
      actions.push({
        id: 'a:rename',
        section: 'Actions',
        label: 'Rename this conversation',
        run: () => { setTitle(active.title); setRenaming(true); },
      });
      actions.push({
        id: 'a:delete',
        section: 'Actions',
        label: confirmDelete ? 'Confirm delete' : 'Delete this conversation',
        danger: confirmDelete,
        run: () => {
          if (!confirmDelete) { setConfirmDelete(true); return; }
          onDelete(active.id);
          onClose();
        },
      });
    }
    actions.push(engine.isAuthenticated
      ? { id: 'a:out', section: 'Actions', label: 'Sign out', run: () => { void engine.logout(); onClose(); } }
      : { id: 'a:in', section: 'Actions', label: 'Sign in', run: () => { engine.login(); onClose(); } });
    actions.push({ id: 'a:usage', section: 'Actions', label: 'Usage and credits', run: () => go('/settings#usage') });
    actions.push({ id: 'a:stake', section: 'Actions', label: 'Stake for daily prompts', run: () => go('/staking') });

    for (const a of actions) {
      if (!q || fuzzyScore(q, a.label) >= 0) out.push(a);
    }

    // models
    for (const m of engine.models) {
      if (q && fuzzyScore(q, `${m.name} ${m.description}`) < 0) continue;
      const n = engine.workerCount(m);
      out.push({
        id: `m:${m.id}`,
        section: 'Models',
        label: m.name,
        hint: m.costLabel,
        detail: n > 0 ? `${n} ${n === 1 ? 'worker' : 'workers'} online` : 'no workers right now',
        checked: m.id === plan.id,
        run: () => { onPlan(m); onClose(); },
      });
    }
    if (!q || fuzzyScore(q, engine.swarmModel.name) >= 0) {
      out.push({
        id: 'm:swarm',
        section: 'Models',
        label: engine.swarmModel.name,
        detail: engine.swarmModel.description,
        disabled: true,
        launching: true,
      });
    }

    // the same answer, from a different model
    if (canAskAgain) {
      for (const m of engine.models) {
        if (q && fuzzyScore(q, `ask again ${m.name}`) < 0) continue;
        out.push({
          id: `r:${m.id}`,
          section: 'Ask again with',
          label: m.name,
          hint: m.costLabel,
          run: () => { onAskAgain(m); onClose(); },
        });
      }
    }

    return out;
  }, [query, hits, activeId, active, plan, think, hasInstructions, confirmDelete, canAskAgain, canEditLast,
    engine, onSelect, onClose, onNew, onThink, onEditInstructions, onAskAgain, onEditLast, onDelete, onPlan, go]);

  // the highlighted row is always one that can be run; -1 means none can
  const first = items.findIndex(i => !i.disabled);
  const clamped = Math.min(Math.max(index, 0), Math.max(items.length - 1, 0));
  const at = items[clamped] && !items[clamped].disabled ? clamped : first;

  const move = useCallback((dir: 1 | -1) => {
    if (items.length === 0) return;
    setIndex(cur => {
      let next = cur;
      for (let step = 0; step < items.length; step++) {
        next = (next + dir + items.length) % items.length;
        if (!items[next].disabled) return next;
      }
      return cur;
    });
  }, [items]);

  useEffect(() => {
    if (at < 0) return;
    list.current?.querySelector<HTMLElement>(`[data-idx="${at}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [at]);

  const commitRename = () => {
    if (active) onRename(active.id, title.trim() || active.title);
    setRenaming(false);
    setTitle('');
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (renaming) { setRenaming(false); return; }
      onClose();
      return;
    }
    if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey) && !e.altKey) {
      // handled here, not by the page shortcut, which would drop a rename in
      // progress by unmounting the panel underneath it
      e.preventDefault();
      e.stopPropagation();
      if (!renaming) onClose();
      return;
    }
    if (renaming) {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[at] ?? (first >= 0 ? items[first] : undefined);
      if (item && !item.disabled) item.run?.();
    }
  };

  let section = '';

  return (
    <div className="cu-fade fixed inset-0 z-50 flex items-end justify-center md:items-start md:pt-[13vh]">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={renaming ? 'Rename conversation' : 'Command palette'}
        className="relative z-10 flex max-h-[76vh] w-full flex-col overflow-hidden rounded-t-[24px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] md:max-h-[62vh] md:w-[38rem] md:rounded-[24px]"
        style={{ background: 'var(--cu-pop)' }}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
          <span className="shrink-0" style={{ color: 'var(--cu-faint)' }}><Search /></span>
          <input
            ref={input}
            value={renaming ? title : query}
            onChange={e => (renaming ? setTitle(e.target.value) : onQuery(e.target.value))}
            placeholder={renaming ? 'New title' : 'Search conversations and commands'}
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-fg-30"
            style={{ color: 'var(--cu-text)' }}
            aria-label={renaming ? 'New title' : 'Search'}
          />
          <span className="hidden shrink-0 text-[12px] md:block" style={{ color: 'var(--cu-faint)' }}>esc</span>
        </div>

        {renaming ? (
          <div className="px-5 pb-5 text-[13px]" style={{ color: 'var(--cu-faint)' }}>
            Press Enter to rename, Escape to go back.
          </div>
        ) : (
          <div ref={list} className="cu-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
            {items.length === 0 && (
              <p className="px-3 py-6 text-[13px]" style={{ color: 'var(--cu-faint)' }}>Nothing matches that.</p>
            )}

            {items.map((item, i) => {
              const head = item.section !== section ? item.section : null;
              section = item.section;
              const on = i === at;
              return (
                <div key={item.id}>
                  {head && (
                    <div className="px-3 pb-1 pt-3 text-[12px]" style={{ color: 'var(--cu-faint)' }}>{head}</div>
                  )}
                  <button
                    data-idx={i}
                    disabled={item.disabled}
                    // mousemove, not mouseenter: arrowing down scrolls the list
                    // under a still cursor, and that must not steal the row back
                    onMouseMove={() => { if (!item.disabled) setIndex(i); }}
                    onClick={() => item.run?.()}
                    className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors disabled:opacity-55"
                    style={{ background: on ? 'var(--chat-row-on)' : 'transparent' }}
                  >
                    <span className="mt-[3px] w-4 shrink-0" style={{ color: 'var(--cu-steel)' }}>{item.checked && <Check />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13.5px]" style={{ color: item.danger ? 'var(--danger)' : 'var(--cu-text)' }}>
                        <span className="truncate">{item.label}</span>
                        {item.hint && <span className="shrink-0 text-[12px]" style={{ color: 'var(--cu-faint)' }}>{item.hint}</span>}
                        {item.launching && <StatusBadge state="launching" />}
                      </span>
                      {item.detail && (
                        <span className="mt-0.5 block truncate text-[12px]" style={{ color: 'var(--cu-faint)' }}>{item.detail}</span>
                      )}
                      {item.snippet && (
                        <span className="mt-0.5 block truncate text-[12px]" style={{ color: 'var(--cu-faint)' }}>
                          {item.snippet.before}
                          <span style={{ color: 'var(--cu-steel)' }}>{item.snippet.match}</span>
                          {item.snippet.after}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

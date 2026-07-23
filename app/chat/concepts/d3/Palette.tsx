'use client';

// The command palette: the desk's fast lane. Cmd/Ctrl+K anywhere opens it.
// Fuzzy-jump to any conversation, start a new one, act on the current one
// (rename, delete, pin, archive, thinking), switch model (cost, per-model
// worker counts, the launching MiniMax row), and reach account and pages.
// Desktop: a centered panel. Mobile: a bottom sheet. The visible desk stays
// calm; this is the only fast surface. Forked from the Instrument's palette.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { type PlanId } from '../../lib';
import type { ChatEngine } from '../../engine/useChatEngine';
import type { Convo, LiveJob } from './store';

type Section = 'commands' | 'models' | 'conversations';

type Item = {
  id: string;
  section: Section;
  label: string;
  meta?: string;
  right?: React.ReactNode;
  disabled?: boolean;
  keepOpen?: boolean;
  keywords?: string;
  run?: () => void;
};

const SECTION_LABELS: Record<Section, string> = {
  commands: 'commands',
  models: 'models',
  conversations: 'conversations',
};

function matches(query: string, item: Item): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${item.label} ${item.meta ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  return terms.every(t => hay.includes(t));
}

function snippet(c: Convo): string {
  const t = c.tail.trim();
  if (!t) return 'nothing written yet';
  return t.length > 76 ? t.slice(0, 76) + '…' : t;
}

// Mounted only while open; all state initializes fresh per opening.
export default function Palette({
  modKey, initialQuery, onClose, navigate, engine, convos, focused, live,
  onOpenConvo, onNewConversation, onRename, onDelete, onTogglePin, onToggleArchive, onToggleThink, onPickModel, onStop,
}: {
  modKey: string;
  initialQuery: string;
  onClose: () => void;
  navigate: (path: string) => void;
  engine: ChatEngine;
  convos: Convo[];
  focused: Convo | null;
  live: LiveJob | null;
  onOpenConvo: (id: string) => void;
  onNewConversation: () => void;
  onRename: (id: string, subject: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleArchive: (id: string) => void;
  onToggleThink: (id: string) => void;
  onPickModel: (model: PlanId) => void;
  onStop: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'root' | 'rename' | 'delete'>('root');
  const [renameValue, setRenameValue] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const focusedPlan = focused ? engine.models.find(m => m.id === focused.model) ?? engine.models[0] : null;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];

    out.push({ id: 'new', section: 'commands', label: 'new conversation', keywords: 'create start chat', run: () => onNewConversation() });

    if (focused) {
      out.push({ id: 'rename', section: 'commands', label: 'rename conversation', keepOpen: true, keywords: 'title name', run: () => { setRenameValue(focused.subject); setMode('rename'); } });
      out.push({ id: 'delete', section: 'commands', label: 'delete conversation', keepOpen: true, keywords: 'remove trash', run: () => setMode('delete') });
      if (focusedPlan?.thinking) {
        out.push({
          id: 'think',
          section: 'commands',
          label: focused.think ? 'turn deep thinking off' : 'turn deep thinking on',
          keywords: 'thinking reason deep',
          run: () => onToggleThink(focused.id),
        });
      }
      out.push({ id: 'pin', section: 'commands', label: focused.pinned ? 'unpin conversation' : 'pin to the desk', keywords: 'pin favourite', run: () => onTogglePin(focused.id) });
      out.push({ id: 'archive', section: 'commands', label: focused.archived ? 'restore to the desk' : 'archive conversation', keywords: 'archive done hide', run: () => onToggleArchive(focused.id) });
    }

    if (live) out.push({ id: 'stop', section: 'commands', label: 'stop generating', keywords: 'cancel halt', run: () => onStop() });

    if (engine.isAuthenticated) {
      out.push({
        id: 'signout',
        section: 'commands',
        label: engine.displayName ? `sign out (${engine.displayName})` : 'sign out',
        keywords: 'logout account',
        run: () => { void engine.logout(); },
      });
    } else {
      out.push({ id: 'signin', section: 'commands', label: 'sign in', keywords: 'login account', run: () => engine.login() });
    }
    out.push({ id: 'usage', section: 'commands', label: 'usage and credits', meta: '/settings#usage', keywords: 'top up balance billing credits', run: () => navigate('/settings#usage') });
    out.push({ id: 'staking', section: 'commands', label: 'staking', meta: '/staking', keywords: 'stake allowance prompts', run: () => navigate('/staking') });
    out.push({ id: 'home', section: 'commands', label: 'home', meta: '/', keywords: 'landing', run: () => navigate('/') });

    for (const p of engine.models) {
      const n = engine.workerCount(p);
      const caps = [p.vision ? 'vision' : null, p.thinking ? 'thinking' : null].filter(Boolean).join(' + ');
      out.push({
        id: `model-${p.id}`,
        section: 'models',
        label: focused ? `switch to ${p.name}` : `new chat with ${p.name}`,
        meta: [p.costLabel, caps || null, focused && p.id === focused.model ? 'current' : null].filter(Boolean).join(' · '),
        keywords: `model switch ${p.description}`,
        right: (
          <span className="flex items-center gap-1.5 pixel-sans text-[11px] text-white/40">
            <span className={`h-1.5 w-1.5 rounded-full ${n > 0 ? 'bg-[rgba(52,211,153,0.9)]' : 'bg-white/20'}`} />
            {n} worker{n === 1 ? '' : 's'}
          </span>
        ),
        run: () => onPickModel(p.id),
      });
    }
    out.push({
      id: 'model-swarm',
      section: 'models',
      label: engine.swarmModel.name,
      meta: engine.swarmModel.description,
      keywords: 'model minimax swarm launching',
      disabled: true,
      right: <StatusBadge state="launching" />,
    });

    const ordered = [...convos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const c of ordered) {
      out.push({
        id: `convo-${c.id}`,
        section: 'conversations',
        label: c.subject,
        meta: `${snippet(c)}${c.id === focused?.id ? '  ·  current' : c.archived ? '  ·  archived' : ''}`,
        keywords: `conversation open switch ${c.tail}`,
        run: () => onOpenConvo(c.id),
      });
    }
    return out;
  }, [convos, engine, focused, focusedPlan, live, navigate, onNewConversation, onOpenConvo, onPickModel, onStop, onToggleArchive, onTogglePin, onToggleThink]);

  const visible = useMemo(() => items.filter(i => matches(query, i)), [items, query]);
  const selectable = useMemo(() => visible.filter(i => !i.disabled), [visible]);

  useEffect(() => {
    const item = selectable[highlight];
    if (!item) return;
    document.getElementById(`d3-pal-${item.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight, selectable]);

  const runItem = useCallback((item: Item) => {
    if (item.disabled) return;
    item.run?.();
    if (!item.keepOpen) onClose();
  }, [onClose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (mode === 'rename') {
      if (e.key === 'Enter') {
        e.preventDefault();
        const v = renameValue.trim();
        if (focused && v) onRename(focused.id, v);
        onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMode('root');
      }
      return;
    }
    if (mode === 'delete') {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (focused) onDelete(focused.id);
        onClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMode('root');
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, Math.max(selectable.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = selectable[highlight];
      if (item) runItem(item);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [mode, focused, renameValue, onRename, onDelete, onClose, selectable, highlight, runItem]);

  const sections: Section[] = ['commands', 'models', 'conversations'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c0a09]/60 backdrop-blur-[2px] sm:items-start sm:pt-[16vh]"
      onMouseDown={onClose}
      onKeyDown={e => {
        // Escape closes even when focus sits on a list row (the input's own
        // handler preventDefaults first, so mode transitions are not doubled).
        if (e.key === 'Escape' && !e.defaultPrevented) onClose();
      }}
    >
      <div
        className="w-full rounded-t-2xl border border-white/10 bg-[#0c0a09] shadow-2xl shadow-black/60 sm:w-[560px] sm:rounded-xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="border-b border-white/10 px-4 py-3">
          {mode === 'delete' ? (
            <input
              key="delete"
              ref={inputRef}
              autoFocus
              readOnly
              value=""
              placeholder={`Press Enter to delete "${focused?.subject ?? ''}", Esc to keep it`}
              onKeyDown={onKeyDown}
              className="pixel-sans w-full bg-transparent text-sm text-red-200/90 outline-none placeholder:text-red-200/70"
            />
          ) : (
            <input
              key={mode}
              ref={inputRef}
              autoFocus
              value={mode === 'rename' ? renameValue : query}
              onChange={e => {
                if (mode === 'rename') {
                  setRenameValue(e.target.value);
                } else {
                  setQuery(e.target.value);
                  setHighlight(0);
                }
              }}
              onKeyDown={onKeyDown}
              placeholder={mode === 'rename' ? 'new conversation name' : 'search conversations, models, commands'}
              className="pixel-sans w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
            />
          )}
        </div>

        {mode === 'root' && (
          <div className="max-h-[min(420px,55vh)] overflow-y-auto py-2">
            {visible.length === 0 && (
              <div className="pixel-sans px-4 py-6 text-center text-sm text-white/35">Nothing matches.</div>
            )}
            {sections.map(section => {
              const rows = visible.filter(i => i.section === section);
              if (rows.length === 0) return null;
              return (
                <div key={section} className="mb-1">
                  <div className="pixel-sans px-4 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-white/30">
                    {SECTION_LABELS[section]}
                  </div>
                  {rows.map(item => {
                    const selIdx = selectable.indexOf(item);
                    const active = selIdx === highlight && selIdx !== -1;
                    return (
                      <button
                        key={item.id}
                        id={`d3-pal-${item.id}`}
                        onClick={() => runItem(item)}
                        onMouseMove={() => { if (selIdx !== -1 && selIdx !== highlight) setHighlight(selIdx); }}
                        disabled={item.disabled}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                          item.disabled ? 'cursor-default opacity-60' : 'cursor-pointer'
                        } ${active ? 'bg-white/[0.07]' : ''}`}
                      >
                        <span className="min-w-0">
                          <span className={`pixel-sans block truncate text-sm ${item.disabled ? 'text-white/50' : 'text-white/85'}`}>
                            {item.label}
                          </span>
                          {item.meta && (
                            <span className="pixel-sans block truncate text-[11px] text-white/35">{item.meta}</span>
                          )}
                        </span>
                        {item.right && <span className="shrink-0">{item.right}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div className="pixel-sans flex items-center gap-3 border-t border-white/10 px-4 py-2 text-[10px] text-white/30">
          <span>arrows navigate</span>
          <span>enter select</span>
          <span>esc close</span>
          <span className="ml-auto">{modKey}K</span>
        </div>
      </div>
    </div>
  );
}

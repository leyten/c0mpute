'use client';

// The command palette: the instrument's entire control surface. Commands,
// model selection (cost, per-model workers, the launching swarm row), and
// conversation switching live here. Desktop: centered panel. Mobile: bottom
// sheet. Modes: root search, inline rename, delete confirm.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import StatusBadge from '@/components/StatusBadge';
import { formatChatDate } from '../../lib';
import type { Instrument } from './useInstrument';

type Item = {
  id: string;
  section: 'commands' | 'models' | 'conversations';
  label: string;
  meta?: string;
  right?: React.ReactNode;
  disabled?: boolean;
  keepOpen?: boolean;
  keywords?: string;
  run?: () => void;
};

const SECTION_LABELS: Record<Item['section'], string> = {
  commands: 'Commands',
  models: 'Models',
  conversations: 'Conversations',
};

function matches(query: string, item: Item): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const hay = `${item.label} ${item.meta ?? ''} ${item.keywords ?? ''}`.toLowerCase();
  return terms.every(t => hay.includes(t));
}

// Mounted only while open; all state initializes fresh per opening.
export default function Palette({ initialQuery, modKey, onClose, inst, navigate }: {
  initialQuery: string;
  modKey: string;
  onClose: () => void;
  inst: Instrument;
  navigate: (path: string) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<'root' | 'rename' | 'delete'>('root');
  const [renameValue, setRenameValue] = useState('');
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { engine, activeThread } = inst;

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    out.push({ id: 'new', section: 'commands', label: 'New conversation', keywords: 'create chat start', run: () => inst.newConversation() });
    if (activeThread) {
      out.push({ id: 'rename', section: 'commands', label: 'Rename conversation', keepOpen: true, run: () => { setRenameValue(activeThread.title); setMode('rename'); } });
      out.push({ id: 'delete', section: 'commands', label: 'Delete conversation', keepOpen: true, run: () => setMode('delete') });
    }
    if (inst.currentPlan.thinking) {
      out.push({
        id: 'think',
        section: 'commands',
        label: inst.currentThink ? 'Turn deep thinking off' : 'Turn deep thinking on',
        keywords: 'thinking reason deep',
        run: () => inst.toggleThink(),
      });
    }
    if (inst.turn) out.push({ id: 'stop', section: 'commands', label: 'Stop generating', run: () => inst.cancel() });
    if (inst.turnError && inst.turnError.threadId === (activeThread?.id ?? '')) {
      out.push({ id: 'retry', section: 'commands', label: 'Retry last prompt', run: () => inst.retry() });
    }
    if (engine.isAuthenticated) {
      out.push({
        id: 'signout',
        section: 'commands',
        label: engine.displayName ? `Sign out (${engine.displayName})` : 'Sign out',
        keywords: 'logout account',
        run: () => { void engine.logout(); },
      });
    } else {
      out.push({ id: 'signin', section: 'commands', label: 'Sign in', keywords: 'login account', run: () => engine.login() });
    }
    out.push({ id: 'usage', section: 'commands', label: 'Usage and credits', meta: '/settings#usage', keywords: 'top up balance billing', run: () => navigate('/settings#usage') });
    out.push({ id: 'staking', section: 'commands', label: 'Staking', meta: '/staking', keywords: 'stake allowance', run: () => navigate('/staking') });
    out.push({ id: 'home', section: 'commands', label: 'Home', meta: '/', keywords: 'landing', run: () => navigate('/') });

    for (const p of engine.models) {
      const n = engine.workerCount(p);
      const caps = [p.vision ? 'vision' : null, p.thinking ? 'thinking' : null].filter(Boolean).join(' + ');
      out.push({
        id: `model-${p.id}`,
        section: 'models',
        label: p.name,
        meta: [p.costLabel, caps || null, p.id === inst.currentPlan.id ? 'current' : null].filter(Boolean).join(' · '),
        keywords: `model switch ${p.description}`,
        right: (
          <span className="flex items-center gap-1.5 text-[11px] text-white/40">
            <span className={`h-1.5 w-1.5 rounded-full ${n > 0 ? 'bg-emerald-400/90' : 'bg-white/20'}`} />
            {n} worker{n === 1 ? '' : 's'}
          </span>
        ),
        run: () => inst.setModel(p.id),
      });
    }
    out.push({
      id: 'model-swarm',
      section: 'models',
      label: engine.swarmModel.name,
      meta: engine.swarmModel.description,
      keywords: 'model minimax swarm',
      disabled: true,
      right: <StatusBadge state="launching" />,
    });

    for (const t of inst.threads) {
      out.push({
        id: `thread-${t.id}`,
        section: 'conversations',
        label: t.title,
        meta: `${formatChatDate(t.updatedAt)}${t.id === activeThread?.id ? ' · current' : ''}`,
        keywords: 'conversation chat open switch',
        run: () => inst.selectThread(t.id),
      });
    }
    return out;
  }, [inst, engine, activeThread, navigate]);

  const visible = useMemo(() => items.filter(i => matches(query, i)), [items, query]);
  const selectable = useMemo(() => visible.filter(i => !i.disabled), [visible]);

  useEffect(() => {
    const item = selectable[highlight];
    if (!item) return;
    document.getElementById(`c1-pal-${item.id}`)?.scrollIntoView({ block: 'nearest' });
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
        if (activeThread) inst.renameThread(activeThread.id, renameValue);
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
        if (activeThread) inst.deleteThread(activeThread.id);
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
  }, [mode, activeThread, inst, renameValue, onClose, selectable, highlight, runItem]);

  const sections: Item['section'][] = ['commands', 'models', 'conversations'];

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
        className="fade-step w-full rounded-t-2xl border border-white/10 bg-[#0c0a09] shadow-2xl sm:w-[560px] sm:rounded-xl"
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
              placeholder={`Press Enter to delete "${activeThread?.title ?? ''}", Esc to keep it`}
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
              placeholder={mode === 'rename' ? 'New conversation name' : 'Search commands, models, conversations'}
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
                        id={`c1-pal-${item.id}`}
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

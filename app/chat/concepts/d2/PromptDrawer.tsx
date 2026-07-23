'use client';

// The drawer: a shared prompt library that slides up from the composer edge.
// A slim tab pulls it open; inside, save the current draft under a name, insert
// a saved prompt into the composer with one click, or delete one. On desktop it
// is a popover above the tab; on mobile it becomes a bottom sheet with a backdrop.

import { useState } from 'react';
import type { Prompt } from './store';
import { IconBookmark, IconChevronDown, IconTrash, IconX } from './Icons';

export default function PromptDrawer({ prompts, draft, onInsert, onSave, onDelete, disabled }: {
  prompts: Prompt[];
  /** Current composer text, so "save draft" has something to save. */
  draft: string;
  onInsert: (body: string) => void;
  onSave: (name: string, body: string) => void;
  onDelete: (id: string) => void;
  /** The composer is gated (signed-out over the free cap); the tab still opens
   *  so a draft can be prepared, but nothing about the drawer changes. */
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const canSave = name.trim().length > 0 && draft.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSave(name.trim(), draft.trim());
    setName('');
  };

  const insert = (body: string) => {
    onInsert(body);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="prompt library"
        className={`cursor-pointer inline-flex items-center gap-1.5 pixel-sans text-[10px] uppercase tracking-[0.14em] rounded-t-lg border border-b-0 px-2.5 py-1 transition-colors ${
          open
            ? 'border-white/20 text-white/80 bg-[#161311]'
            : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
        }`}
      >
        <IconBookmark className="w-3 h-3" />
        prompts
        <IconChevronDown className={`w-3 h-3 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>

      {open && (
        <>
          {/* Mobile backdrop; desktop uses an invisible click-catcher. */}
          <div className="fixed inset-0 z-40 bg-black/40 sm:bg-transparent" onClick={() => setOpen(false)} />
          <div className="fixed sm:absolute inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-full sm:left-0 sm:mb-2 z-50 w-full sm:w-[23rem] max-h-[70vh] sm:max-h-[60vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#161311] shadow-2xl shadow-black/60">
            <div className="flex items-center justify-between px-4 pt-3.5 pb-2 shrink-0">
              <span className="pixel-sans text-[10px] uppercase tracking-[0.18em] text-white/40">prompt library</span>
              <button
                onClick={() => setOpen(false)}
                title="close"
                className="cursor-pointer text-white/35 hover:text-white transition-colors"
              >
                <IconX className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-3 shrink-0">
              <div className="flex items-center gap-2 border border-white/10 focus-within:border-white/25 rounded-xl bg-white/[0.02] px-2.5 py-1.5 transition-colors">
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') save(); }}
                  placeholder="name the current draft"
                  maxLength={40}
                  className="flex-1 min-w-0 bg-transparent outline-none pixel-sans text-[13px] text-white/85 placeholder:text-white/25"
                />
                <button
                  onClick={save}
                  disabled={!canSave}
                  className={`pixel-sans text-[10px] uppercase tracking-[0.12em] rounded-full px-3 py-1 transition-colors ${
                    canSave ? 'cursor-pointer bg-white text-black hover:bg-white/90' : 'bg-white/10 text-white/30'
                  }`}
                >
                  save
                </button>
              </div>
              {!draft.trim() && (
                <p className="pixel-sans text-[10px] text-white/30 mt-1.5">write a draft below to save it here.</p>
              )}
            </div>

            <div className="border-t border-white/10 overflow-y-auto flex-1 min-h-0 py-1">
              {prompts.length === 0 ? (
                <p className="pixel-sans text-[13px] text-white/40 px-4 py-6 text-center">
                  no saved prompts yet. name a draft above to start the library.
                </p>
              ) : (
                prompts.map(p => (
                  <div
                    key={p.id}
                    className="group flex items-start gap-2 px-4 py-2.5 hover:bg-white/[0.04] transition-colors"
                  >
                    <button
                      onClick={() => insert(p.body)}
                      disabled={disabled}
                      title={disabled ? 'sign in to send, drafting still works' : 'insert into the composer'}
                      className="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-default"
                    >
                      <span className="block pixel-sans text-[13px] text-white/85 group-hover:text-white transition-colors">{p.name}</span>
                      <span className="block pixel-sans text-[11px] text-white/40 leading-snug line-clamp-2 mt-0.5">{p.body}</span>
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      title="delete prompt"
                      className="cursor-pointer p-1 -m-1 rounded text-white/25 hover:text-red-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0"
                    >
                      <IconTrash className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

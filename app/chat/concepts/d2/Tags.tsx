'use client';

// Chalk tags. A tag is a short label chalked onto a conversation: small caps,
// hairline border, steel when it is acting as a live filter. The display chip
// is read-only; the editor adds up to three and removes any, and is dropped
// unchanged into both the library card menu and the room header.

import { useState } from 'react';
import { MAX_TAGS, normalizeTag } from './store';
import { IconX } from './Icons';

export function TagChip({ label, active, onClick, title }: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const base =
    'pixel-sans text-[9px] uppercase tracking-[0.16em] rounded-[3px] border px-1.5 py-0.5 leading-none transition-colors';
  const tone = active
    ? 'border-[#80a0c1]/50 text-[#80a0c1] bg-[#80a0c1]/10'
    : 'border-white/15 text-white/45';
  const interactive = onClick ? ' cursor-pointer hover:border-white/35 hover:text-white/70' : '';
  if (!onClick) return <span className={`${base} ${tone}`} title={title}>{label}</span>;
  return (
    <button
      type="button"
      // Chips can sit inside a clickable card; keep the click from opening it.
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      className={`${base} ${tone}${interactive}`}
    >
      {label}
    </button>
  );
}

export function TagEditor({ tags, onAdd, onRemove, autoFocus }: {
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const full = tags.length >= MAX_TAGS;

  const commit = () => {
    const t = normalizeTag(value);
    setValue('');
    if (t && !tags.includes(t) && !full) onAdd(t);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map(t => (
        <span
          key={t}
          className="inline-flex items-center gap-1 pixel-sans text-[9px] uppercase tracking-[0.16em] rounded-[3px] border border-white/15 text-white/55 pl-1.5 pr-1 py-0.5 leading-none"
        >
          {t}
          <button
            type="button"
            onClick={() => onRemove(t)}
            title="remove tag"
            className="cursor-pointer text-white/35 hover:text-white transition-colors"
          >
            <IconX className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      {!full && (
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
            if (e.key === 'Backspace' && !value && tags.length > 0) onRemove(tags[tags.length - 1]);
          }}
          onBlur={commit}
          placeholder={tags.length === 0 ? 'add a tag' : 'add'}
          maxLength={16}
          className="bg-transparent outline-none pixel-sans text-[11px] text-white/80 placeholder:text-white/25 border-b border-white/15 focus:border-white/35 w-16 py-0.5"
        />
      )}
    </div>
  );
}

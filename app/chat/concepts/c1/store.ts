// Concept 1 persistence: the thread store under its own localStorage key,
// exposed as a small external store (subscribe/snapshot/update) so React
// consumes it through useSyncExternalStore. SSR renders the empty server
// snapshot; the client snapshot lazily loads from localStorage on first read.
// Quota failures degrade by dropping image payloads (generated images first,
// then user attachments) before giving up, so text history survives even when
// data-URI images blow the ~5MB budget.

import type { StoreShape, Thread } from './types';

export const STORE_KEY = 'c0mpute_c1_threads';

export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFrom(content: string): string {
  const line = content.replace(/\s+/g, ' ').trim();
  return line.length > 48 ? `${line.slice(0, 45)}...` : line || 'Untitled';
}

// Fresh per call: snapshot identity against SERVER_SNAPSHOT signals hydration.
function emptyStore(): StoreShape {
  return { v: 1, activeId: null, defaultModel: 'max', threads: [] };
}

function loadStore(): StoreShape {
  if (typeof window === 'undefined') return emptyStore();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.threads)) return emptyStore();
    const threads = parsed.threads.filter(
      (t): t is Thread => !!t && typeof t.id === 'string' && Array.isArray(t.messages),
    );
    return {
      v: 1,
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      defaultModel: parsed.defaultModel ?? 'max',
      threads,
    };
  } catch {
    return emptyStore();
  }
}

function withoutImages(role: 'assistant' | 'user') {
  return (t: Thread): Thread => ({
    ...t,
    messages: t.messages.map(m => (m.role === role && m.images ? { ...m, images: undefined } : m)),
  });
}

function saveStore(store: StoreShape): void {
  if (typeof window === 'undefined') return;
  const attempt = (s: StoreShape) => localStorage.setItem(STORE_KEY, JSON.stringify(s));
  try {
    attempt(store);
    return;
  } catch {
    /* quota: retry slimmer below */
  }
  const noGenerated: StoreShape = { ...store, threads: store.threads.map(withoutImages('assistant')) };
  try {
    attempt(noGenerated);
    return;
  } catch {
    /* still too big */
  }
  const textOnly: StoreShape = { ...noGenerated, threads: noGenerated.threads.map(withoutImages('user')) };
  try {
    attempt(textOnly);
  } catch (err) {
    console.error('c1: failed to persist threads', err);
  }
}

// ---- the external store React subscribes to ----

export const SERVER_SNAPSHOT: StoreShape = { v: 1, activeId: null, defaultModel: 'max', threads: [] };

let cache: StoreShape | null = null;
const listeners = new Set<() => void>();

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getStoreSnapshot(): StoreShape {
  if (cache === null) cache = loadStore();
  return cache;
}

export function getServerStoreSnapshot(): StoreShape {
  return SERVER_SNAPSHOT;
}

export function updateStore(fn: (s: StoreShape) => StoreShape): void {
  const next = fn(getStoreSnapshot());
  if (next === cache) return;
  cache = next;
  saveStore(next);
  listeners.forEach(l => l());
}

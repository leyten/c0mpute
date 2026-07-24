// Concept L1 "Linen" — owned state. The shape is the familiar one: a list of
// threads, one selected, a composer. A thread only exists once a first message
// is sent, so the list never holds empty drafts. Persistence is a single
// versioned localStorage key that also remembers where the reader was.

import { parseSourcesFromContent, parseThinking, type PlanId, type SourceRef } from '../../lib';

export const LINEN_KEY = 'c0mpute_l1';

export type Role = 'user' | 'assistant';

export interface Msg {
  id: string;
  role: Role;
  /** Assistant content keeps the raw wire shape: <think> blocks, an optional
   *  <!--think_time:N--> marker, and a ---SOURCES--- JSON tail, so the pure
   *  parsers in app/chat/lib.ts round-trip it. */
  content: string;
  /** Data URIs (user uploads) or raw base64 (worker-generated). */
  images?: string[];
  createdAt: string;
}

export interface Thread {
  id: string;
  title: string;
  /** True until the user renames it. */
  autoTitle: boolean;
  model: PlanId;
  think: boolean;
  createdAt: string;
  updatedAt: string;
  messages: Msg[];
}

interface LinenFile {
  v: 1;
  threads: Thread[];
  selectedId: string | null;
}

/** The one in-flight job, mirrored into state for rendering. */
export interface LiveJob {
  threadId: string;
  status: 'queued' | 'searching' | 'streaming';
  text: string;
  queuePos: number | null;
  sources: SourceRef[];
  genImage: boolean;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newThread(model: PlanId, think: boolean): Thread {
  const now = new Date().toISOString();
  return {
    id: uid('t'),
    title: 'untitled',
    autoTitle: true,
    model,
    think,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function titleFrom(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? flat.slice(0, 57) + '…' : flat || 'untitled';
}

export function loadLinen(): { threads: Thread[]; selectedId: string | null } {
  if (typeof window === 'undefined') return { threads: [], selectedId: null };
  try {
    const raw = localStorage.getItem(LINEN_KEY);
    if (!raw) return { threads: [], selectedId: null };
    const data = JSON.parse(raw) as LinenFile;
    if (!data || data.v !== 1 || !Array.isArray(data.threads)) return { threads: [], selectedId: null };
    const threads = data.threads.filter(
      t => t && typeof t.id === 'string' && typeof t.title === 'string' && Array.isArray(t.messages),
    );
    return { threads, selectedId: typeof data.selectedId === 'string' ? data.selectedId : null };
  } catch {
    return { threads: [], selectedId: null };
  }
}

// Save everything. Generated images are large base64 blobs that can blow the
// ~5MB quota; on failure retry with assistant images stripped (text history
// beats losing persistence).
export function saveLinen(threads: Thread[], selectedId: string | null): void {
  if (typeof window === 'undefined') return;
  const write = (list: Thread[]) =>
    localStorage.setItem(LINEN_KEY, JSON.stringify({ v: 1, threads: list, selectedId } satisfies LinenFile));
  try {
    write(threads);
  } catch {
    try {
      write(threads.map(t => ({
        ...t,
        messages: t.messages.map(m => (m.role === 'assistant' && m.images ? { ...m, images: undefined } : m)),
      })));
    } catch (err) {
      console.error('linen: could not persist conversations', err);
    }
  }
}

/** The visible text of a message: sources tail off, think blocks off for assistant turns. */
export function messageText(m: Msg): string {
  const { cleanContent } = parseSourcesFromContent(m.content);
  return m.role === 'assistant' ? parseThinking(cleanContent).response : cleanContent;
}

/** Sidebar grouping, newest first: today, yesterday, this week, earlier. */
export function groupThreads(threads: Thread[]): { label: string; items: Thread[] }[] {
  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86400000;
  const buckets: Record<string, Thread[]> = {};
  for (const t of sorted) {
    const ts = new Date(t.updatedAt).getTime();
    const label =
      ts >= dayStart ? 'today'
      : ts >= dayStart - DAY ? 'yesterday'
      : ts >= dayStart - 6 * DAY ? 'this week'
      : 'earlier';
    (buckets[label] ??= []).push(t);
  }
  return ['today', 'yesterday', 'this week', 'earlier']
    .filter(l => buckets[l])
    .map(l => ({ label: l, items: buckets[l] }));
}

/** Render any stored image string, data URI or raw base64. */
export function imgSrc(s: string): string {
  return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
}

/** Wire format for vision input is raw base64 without the data URI prefix. */
export function imgWire(s: string): string {
  const i = s.indexOf('base64,');
  return i === -1 ? s : s.slice(i + 'base64,'.length);
}

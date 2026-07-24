// Concept L3 "Glass" — conversation records and persistence. One versioned
// localStorage key holds the conversations and the last-open selection so a
// reload resumes exactly where the reader left off.

import { parseSourcesFromContent, parseThinking, type PlanId, type SourceRef } from '../../lib';

export const GLASS_KEY = 'c0mpute_l3';

export interface GlassMessage {
  id: string;
  role: 'user' | 'assistant';
  /** Assistant content keeps the raw wire shape: <think> blocks, an optional
   *  <!--think_time:N--> marker, and a ---SOURCES--- JSON tail, so the pure
   *  parsers in app/chat/lib.ts round-trip it. */
  content: string;
  /** Data URIs (user uploads) or raw base64 (worker-generated). */
  images?: string[];
  createdAt: string;
}

export interface Convo {
  id: string;
  title: string;
  /** True until the user renames it; while true the first user message names it. */
  autoTitle: boolean;
  model: PlanId;
  think: boolean;
  createdAt: string;
  updatedAt: string;
  messages: GlassMessage[];
}

interface GlassFile {
  v: 1;
  activeId: string | null;
  conversations: Convo[];
}

/** The one in-flight job, mirrored into state for rendering. */
export interface LiveJob {
  convoId: string;
  status: 'queued' | 'searching' | 'streaming';
  text: string;
  queuePos: number | null;
  sources: SourceRef[];
  genImage: boolean;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newConvo(model: PlanId, think: boolean): Convo {
  const now = new Date().toISOString();
  return {
    id: uid('c'),
    title: 'untitled',
    autoTitle: true,
    model,
    think,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function loadGlass(): { conversations: Convo[]; activeId: string | null } {
  if (typeof window === 'undefined') return { conversations: [], activeId: null };
  try {
    const raw = localStorage.getItem(GLASS_KEY);
    if (!raw) return { conversations: [], activeId: null };
    const data = JSON.parse(raw) as GlassFile;
    if (!data || data.v !== 1 || !Array.isArray(data.conversations)) return { conversations: [], activeId: null };
    const conversations = data.conversations.filter(
      c => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages),
    );
    return { conversations, activeId: typeof data.activeId === 'string' ? data.activeId : null };
  } catch {
    return { conversations: [], activeId: null };
  }
}

// Save everything. Generated images are large base64 blobs that can blow the
// ~5MB quota; on failure retry with assistant images stripped (text history
// beats losing persistence).
export function saveGlass(conversations: Convo[], activeId: string | null): void {
  if (typeof window === 'undefined') return;
  const write = (list: Convo[]) =>
    localStorage.setItem(GLASS_KEY, JSON.stringify({ v: 1, activeId, conversations: list } satisfies GlassFile));
  try {
    write(conversations);
  } catch {
    try {
      write(conversations.map(c => ({
        ...c,
        messages: c.messages.map(m => (m.role === 'assistant' && m.images ? { ...m, images: undefined } : m)),
      })));
    } catch (err) {
      console.error('glass: could not persist conversations', err);
    }
  }
}

/** The visible text of a message: sources tail off, think blocks off for assistant turns. */
export function messageText(m: GlassMessage): string {
  const { cleanContent } = parseSourcesFromContent(m.content);
  return m.role === 'assistant' ? parseThinking(cleanContent).response : cleanContent;
}

/** Name a conversation after its first message. */
export function titleFrom(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!flat) return 'untitled';
  return flat.length > 60 ? flat.slice(0, 57) + '…' : flat;
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

export type DayGroup = 'today' | 'yesterday' | 'previous 7 days' | 'older';
export const DAY_GROUPS: DayGroup[] = ['today', 'yesterday', 'previous 7 days', 'older'];

export function dayGroup(dateStr: string): DayGroup {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'previous 7 days';
  return 'older';
}

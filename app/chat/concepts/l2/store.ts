// Steel — owned state. A conversation is the plain, familiar object: a title,
// a model, its messages. Persistence is one versioned localStorage key that
// also remembers which conversation was open, so a return visit resumes
// exactly where the last one ended.

import { parseSourcesFromContent, parseThinking, type PlanId, type SourceRef } from '../../lib';

export const STORE_KEY = 'c0mpute_l2';

export type Role = 'user' | 'assistant';

export interface ChatMessage {
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

export interface Chat {
  id: string;
  title: string;
  /** True until the user renames it; while true the first user message names it. */
  autoTitle: boolean;
  model: PlanId;
  think: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface StoreFile {
  v: 1;
  activeId: string | null;
  chats: Chat[];
}

/** The one in-flight job, mirrored into state for rendering. */
export interface LiveJob {
  chatId: string;
  status: 'queued' | 'searching' | 'streaming';
  text: string;
  queuePos: number | null;
  sources: SourceRef[];
  genImage: boolean;
}

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function newChat(model: PlanId): Chat {
  const now = new Date().toISOString();
  return {
    id: uid('c'),
    title: 'new conversation',
    autoTitle: true,
    model,
    think: false,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

/** A chat that never received a message and was never renamed. */
export function isBlank(c: Chat): boolean {
  return c.messages.length === 0 && c.autoTitle;
}

export function loadStore(): { chats: Chat[]; activeId: string | null } {
  if (typeof window === 'undefined') return { chats: [], activeId: null };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { chats: [], activeId: null };
    const data = JSON.parse(raw) as StoreFile;
    if (!data || data.v !== 1 || !Array.isArray(data.chats)) return { chats: [], activeId: null };
    const chats = data.chats.filter(
      c => c && typeof c.id === 'string' && typeof c.title === 'string' && Array.isArray(c.messages),
    );
    return { chats, activeId: typeof data.activeId === 'string' ? data.activeId : null };
  } catch {
    return { chats: [], activeId: null };
  }
}

// Save the store. Blank drafts are not worth a slot. Generated images are
// large base64 blobs that can blow the ~5MB quota; on failure retry with
// assistant images stripped (text history beats losing persistence).
export function saveStore(chats: Chat[], activeId: string | null): void {
  if (typeof window === 'undefined') return;
  const keep = chats.filter(c => !isBlank(c));
  const write = (list: Chat[]) =>
    localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, activeId, chats: list } satisfies StoreFile));
  try {
    write(keep);
  } catch {
    try {
      write(keep.map(c => ({
        ...c,
        messages: c.messages.map(m => (m.role === 'assistant' && m.images ? { ...m, images: undefined } : m)),
      })));
    } catch (err) {
      console.error('steel: could not persist conversations', err);
    }
  }
}

/** The visible text of a message: sources tail off, think blocks off for assistant turns. */
export function messageText(m: ChatMessage): string {
  const { cleanContent } = parseSourcesFromContent(m.content);
  return m.role === 'assistant' ? parseThinking(cleanContent).response : cleanContent;
}

/** Title a conversation after its first message. */
export function titleFrom(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  if (!flat) return 'new conversation';
  return flat.length > 48 ? flat.slice(0, 47).trimEnd() + '…' : flat;
}

export type GroupKey = 'today' | 'yesterday' | 'this week' | 'earlier';
export const GROUP_ORDER: GroupKey[] = ['today', 'yesterday', 'this week', 'earlier'];

export function groupOf(iso: string): GroupKey {
  const d = new Date(iso);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return 'this week';
  return 'earlier';
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

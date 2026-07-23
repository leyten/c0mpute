// Concept 2 "The desk" — owned state. The desk treats a conversation as a
// first-class object: subject, model, pinned/archived flags, and a readable
// tail excerpt all live in the record so the library can render without
// touching message bodies. Persistence is a single versioned localStorage key.

import { parseSourcesFromContent, parseThinking, type PlanId, type SourceRef } from '../../lib';

export const DESK_KEY = 'c0mpute_c2_desk';

export type DeskRole = 'user' | 'assistant';

export interface DeskMessage {
  id: string;
  role: DeskRole;
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
  subject: string;
  /** True until the user renames it; while true the first user message names it. */
  autoSubject: boolean;
  model: PlanId;
  think: boolean;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** One-line excerpt of the latest message, pre-cleaned for the library card. */
  tail: string;
  messages: DeskMessage[];
}

interface DeskFile {
  v: 1;
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

export function newConvo(model: PlanId): Convo {
  const now = new Date().toISOString();
  return {
    id: uid('c'),
    subject: 'untitled',
    autoSubject: true,
    model,
    think: false,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
    tail: '',
    messages: [],
  };
}

export function loadDesk(): Convo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(DESK_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as DeskFile;
    if (!data || data.v !== 1 || !Array.isArray(data.conversations)) return [];
    return data.conversations.filter(
      c => c && typeof c.id === 'string' && typeof c.subject === 'string' && Array.isArray(c.messages),
    );
  } catch {
    return [];
  }
}

// Save the desk. Empty auto-subject drafts are not worth a slot. Generated
// images are large base64 blobs that can blow the ~5MB quota; on failure retry
// with assistant images stripped (text history beats losing persistence).
export function saveDesk(conversations: Convo[]): void {
  if (typeof window === 'undefined') return;
  const keep = conversations.filter(c => c.messages.length > 0 || !c.autoSubject);
  const write = (list: Convo[]) =>
    localStorage.setItem(DESK_KEY, JSON.stringify({ v: 1, conversations: list } satisfies DeskFile));
  try {
    write(keep);
  } catch {
    try {
      write(keep.map(c => ({
        ...c,
        messages: c.messages.map(m => (m.role === 'assistant' && m.images ? { ...m, images: undefined } : m)),
      })));
    } catch (err) {
      console.error('desk: could not persist conversations', err);
    }
  }
}

/** The visible text of a message: sources tail off, think blocks off for assistant turns. */
export function messageText(m: DeskMessage): string {
  const { cleanContent } = parseSourcesFromContent(m.content);
  return m.role === 'assistant' ? parseThinking(cleanContent).response : cleanContent;
}

/** Flatten a message body into a card-sized excerpt. */
export function tailOf(content: string): string {
  const { cleanContent } = parseSourcesFromContent(content);
  const flat = parseThinking(cleanContent).response
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' [image] ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*[#>*+-]+[ \t]+/gm, '')
    .replace(/[*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > 220 ? flat.slice(0, 220) : flat;
}

export interface SearchHit {
  convo: Convo;
  snippet: string;
}

// Instant search across subjects and message bodies. Subject hits show the
// tail; body hits show a window around the newest match.
export function searchDesk(convos: Convo[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const c of convos) {
    if (c.subject.toLowerCase().includes(q)) {
      hits.push({ convo: c, snippet: c.tail });
      continue;
    }
    for (let i = c.messages.length - 1; i >= 0; i--) {
      const text = messageText(c.messages[i]).replace(/\s+/g, ' ');
      const at = text.toLowerCase().indexOf(q);
      if (at !== -1) {
        const start = Math.max(0, at - 60);
        const end = Math.min(text.length, at + q.length + 90);
        hits.push({
          convo: c,
          snippet: (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''),
        });
        break;
      }
    }
  }
  return hits.sort((a, b) => b.convo.updatedAt.localeCompare(a.convo.updatedAt));
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

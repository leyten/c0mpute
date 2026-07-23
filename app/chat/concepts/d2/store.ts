// Iteration D2 "The desk, deeper" — a workspace. Same first-class conversation
// record as c2 (subject, model, flags, tail) plus two workspace additions that
// persist: up to three chalk tags per conversation, and a shared prompt library.
// Persistence is one versioned localStorage key; on first run it seeds itself,
// read-only, from an existing c2 desk so nothing is lost switching iterations.

import { parseSourcesFromContent, parseThinking, type PlanId, type SourceRef } from '../../lib';

export const DESK_KEY = 'c0mpute_d2_desk';
/** The c2 desk we migrate from once, read-only, when d2 has never been saved. */
const C2_KEY = 'c0mpute_c2_desk';

export const MAX_TAGS = 3;
const MAX_TAG_LEN = 16;

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
  /** Up to three short chalk labels. Always an array after load(). */
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** One-line excerpt of the latest message, pre-cleaned for the library card. */
  tail: string;
  messages: DeskMessage[];
}

/** A saved prompt in the shared drawer. Insert into any composer, delete freely. */
export interface Prompt {
  id: string;
  name: string;
  body: string;
}

export interface DeskData {
  conversations: Convo[];
  prompts: Prompt[];
}

interface DeskFile {
  v: 1;
  conversations: Convo[];
  prompts: Prompt[];
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
    tags: [],
    createdAt: now,
    updatedAt: now,
    tail: '',
    messages: [],
  };
}

/** Four tasteful starters about the network, seeded once. Plain, professional. */
export const STARTER_PROMPTS: Prompt[] = [
  {
    id: 'seed-specdec',
    name: 'speculative decoding',
    body: 'Explain speculative decoding and how a small draft model plus a large verifier speeds up inference without changing the output distribution. Cite your sources.',
  },
  {
    id: 'seed-client',
    name: 'python api client',
    body: 'Write a small Python client for the c0mpute chat API: open a connection, submit a prompt, and stream the tokens back to stdout as they arrive. Keep it dependency-light and handle errors.',
  },
  {
    id: 'seed-attention',
    name: 'attention math',
    body: 'Walk through the math of scaled dot-product attention step by step. Give the shape of Q, K, and V at each stage, show why the scores are scaled by the square root of the head dimension, and end with the softmax.',
  },
  {
    id: 'seed-estimate',
    name: 'gpu estimate',
    body: 'Estimate how many consumer GPUs it would take to serve a 229B-parameter model at 20 tokens per second for a single stream. State your assumptions about memory bandwidth and quantization, and show the reasoning.',
  },
];

/** Trim, collapse whitespace, cap length, and lowercase a tag; empty means reject. */
export function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_TAG_LEN);
}

/** Every tag currently in use, unique, sorted for a stable filter row. */
export function allTags(convos: Convo[]): string[] {
  const set = new Set<string>();
  for (const c of convos) for (const t of c.tags) set.add(t);
  return [...set].sort();
}

function coerceConvo(c: unknown): Convo | null {
  if (!c || typeof c !== 'object') return null;
  const r = c as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.subject !== 'string' || !Array.isArray(r.messages)) return null;
  return {
    ...(r as unknown as Convo),
    tags: Array.isArray(r.tags)
      ? (r.tags as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, MAX_TAGS)
      : [],
  };
}

function readConvos(raw: string | null): Convo[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<DeskFile>;
    if (!data || data.v !== 1 || !Array.isArray(data.conversations)) return null;
    return data.conversations.map(coerceConvo).filter((c): c is Convo => c !== null);
  } catch {
    return null;
  }
}

// Load the whole desk. If d2 has never been saved, seed conversations, read-only,
// from a c2 desk (the c2 key is never written) so switching iterations keeps work.
// Prompts default to the starters until the user edits the library.
export function loadDesk(): DeskData {
  if (typeof window === 'undefined') return { conversations: [], prompts: STARTER_PROMPTS };
  const raw = localStorage.getItem(DESK_KEY);
  if (raw) {
    const conversations = readConvos(raw) ?? [];
    let prompts = STARTER_PROMPTS;
    try {
      const data = JSON.parse(raw) as Partial<DeskFile>;
      if (Array.isArray(data.prompts)) {
        prompts = data.prompts.filter(
          (p): p is Prompt => !!p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.body === 'string',
        );
      }
    } catch { /* keep starters */ }
    return { conversations, prompts };
  }
  // First run on d2: migrate conversations from c2 without touching the c2 key.
  const migrated = readConvos(localStorage.getItem(C2_KEY)) ?? [];
  return { conversations: migrated, prompts: STARTER_PROMPTS };
}

// Save the desk. Empty auto-subject drafts are not worth a slot. Generated
// images are large base64 blobs that can blow the ~5MB quota; on failure retry
// with assistant images stripped (text history beats losing persistence).
export function saveDesk(data: DeskData): void {
  if (typeof window === 'undefined') return;
  const keep = data.conversations.filter(c => c.messages.length > 0 || !c.autoSubject);
  const write = (list: Convo[]) =>
    localStorage.setItem(DESK_KEY, JSON.stringify({ v: 1, conversations: list, prompts: data.prompts } satisfies DeskFile));
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

// Instant search across subjects, tags, and message bodies. Subject and tag
// hits show the tail; body hits show a window around the newest match.
export function searchDesk(convos: Convo[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const c of convos) {
    if (c.subject.toLowerCase().includes(q) || c.tags.some(t => t.includes(q))) {
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

// Concept D1 "The desk, with the receipt woven in" — owned state. Same desk
// model as C2 (a conversation is a first-class record: subject, model, flags,
// a readable tail), extended so every assistant reply can carry the provenance
// we actually observed while the network served it: which model, which cost
// lane, how long, thinking seconds, source count, worst queue position. That
// metadata is persisted alongside the message so old replies keep their
// receipts. Persistence is a single versioned localStorage key, with a
// one-time read-only seed from the C2 desk.

import { parseSourcesFromContent, parseThinking, type PlanId, type SourceRef } from '../../lib';

export const DESK_KEY = 'c0mpute_d1_desk';
/** The C2 desk. Read once to seed D1 on first load; never written back. */
const LEGACY_KEY = 'c0mpute_c2_desk';

export type DeskRole = 'user' | 'assistant';

/** The receipt for one served reply — only fields we truly observed. A missing
 *  field means it was never measured (a migrated reply, a stop before timing),
 *  and the UI omits it rather than inventing a number. */
export interface Provenance {
  /** Display name of the model that served this reply. */
  model: string;
  planId: PlanId;
  /** Cost lane observed at submit time: '15 cr', 'free prompt', 'staker allowance'. */
  costLabel: string;
  /** Credits actually spent (paid lane); 0 on a free/staker lane. Summed on cards. */
  costCredits: number;
  /** Submit-to-complete wall time in ms. */
  elapsedMs: number | null;
  /** Seconds spent inside <think>, when the model thought. */
  thinkSeconds: number | null;
  sourcesCount: number;
  /** Worst queue position observed; null when the job never queued. */
  queuePeak: number | null;
  /** ISO timestamp of completion. */
  servedAt: string;
}

/** Cost lane + model captured at submit time, before the reply exists. */
export interface ProvBase {
  model: string;
  planId: PlanId;
  costLabel: string;
  costCredits: number;
  submittedAt: number;
}

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
  /** The receipt for an assistant reply we served and observed. Absent on user
   *  turns and on replies migrated in from a schema that never recorded it. */
  provenance?: Provenance;
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
  /** Worst queue position seen so far (feeds the served reply's receipt). */
  queuePeak: number | null;
  sources: SourceRef[];
  genImage: boolean;
  /** Epoch ms at submit; drives the live clock and the elapsed receipt. */
  submittedAt: number;
  /** Cost lane + model observed at submit, carried onto the reply's receipt. */
  prov: ProvBase;
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

function parseDesk(raw: string | null): Convo[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as DeskFile;
    if (!data || data.v !== 1 || !Array.isArray(data.conversations)) return null;
    return data.conversations.filter(
      c => c && typeof c.id === 'string' && typeof c.subject === 'string' && Array.isArray(c.messages),
    );
  } catch {
    return null;
  }
}

// Load the D1 desk. On first load — when the D1 key is empty and a C2 desk
// exists — seed from it read-only: the migrated conversations simply carry no
// provenance, which the UI treats as "not observed" and omits.
export function loadDesk(): Convo[] {
  if (typeof window === 'undefined') return [];
  const mine = parseDesk(localStorage.getItem(DESK_KEY));
  if (mine) return mine;
  const seed = parseDesk(localStorage.getItem(LEGACY_KEY));
  return seed ?? [];
}

// Save the desk. Empty auto-subject drafts are not worth a slot. Generated
// images are large base64 blobs that can blow the ~5MB quota; on failure retry
// with assistant images stripped (text history and receipts beat losing
// persistence — provenance is tiny and always kept).
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

/** Rolled-up work history for a conversation, from observed receipts only. */
export interface ConvoWork {
  /** Fulfilled replies (one per assistant turn). */
  exchanges: number;
  /** Credits actually spent across this conversation (paid lanes only). */
  creditsSpent: number;
  /** Model that served the most recent reply carrying a receipt, if any. */
  lastModel: string | null;
}

export function convoWork(c: Convo): ConvoWork {
  let exchanges = 0;
  let creditsSpent = 0;
  let lastModel: string | null = null;
  for (const m of c.messages) {
    if (m.role !== 'assistant') continue;
    exchanges += 1;
    if (m.provenance) {
      creditsSpent += m.provenance.costCredits;
      lastModel = m.provenance.model;
    }
  }
  return { exchanges, creditsSpent, lastModel };
}

/** Assistant replies as ledger rows for the room's work section (source order). */
export interface LedgerRow {
  id: string;
  createdAt: string;
  provenance?: Provenance;
}
export function ledgerRows(c: Convo): LedgerRow[] {
  return c.messages
    .filter(m => m.role === 'assistant')
    .map(m => ({ id: m.id, createdAt: m.createdAt, provenance: m.provenance }));
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

/** Cost lane observed at submit time — which budget funds this job. */
export function costLaneFor(
  isAuthenticated: boolean,
  credits: { freePrompts: number | null; stakerAllowance: number },
  plan: { costLabel: string; cost: number },
): { costLabel: string; costCredits: number } {
  if (!isAuthenticated) return { costLabel: 'free prompt', costCredits: 0 };
  if ((credits.freePrompts ?? 0) > 0) return { costLabel: 'free prompt', costCredits: 0 };
  if (credits.stakerAllowance > 0) return { costLabel: 'staker allowance', costCredits: 0 };
  return { costLabel: plan.costLabel, costCredits: plan.cost };
}

export function fmtElapsed(ms: number): string {
  if (ms < 0) return '0s';
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

/** Wall-clock time of day for a ledger row, e.g. "14:07". */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

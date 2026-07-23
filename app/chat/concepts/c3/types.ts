// Concept C3 "The Counter" — ledger schema + persistence.
//
// The conversation is a ledger of fulfilled work. Every exchange is a work
// unit: the request, the fulfilment, and the provenance we actually observed
// while the job ran (model, cost lane, elapsed, thinking time, sources,
// queue history). Nothing here is shared with the old chat schema; the
// ledger lives under its own localStorage key.

import type { PlanId, SourceRef } from '../../lib';

export const LEDGER_KEY = 'c0mpute_c3_ledger';
export const PREFS_KEY = 'c0mpute_c3_prefs';

/** Mirrors MAX_INPUT_CHARS in lib/orchestrator/types (the server-side cap). */
export const MAX_INPUT_CHARS = 2000;

export type Provenance = {
  /** Display name of the model that served the job. */
  model: string;
  planId: PlanId;
  /** Cost lane observed at submit time: '15 cr', 'free prompt', 'staker allowance'. */
  costLabel: string;
  /** Submit-to-complete wall time. */
  elapsedMs: number | null;
  /** Seconds spent inside <think>, when the model thought. */
  thinkSeconds: number | null;
  sourcesCount: number;
  /** Worst queue position observed; null when the job never queued. */
  queuePeak: number | null;
  /** ISO timestamp of completion. */
  servedAt: string;
};

export type Exchange = {
  id: string;
  /** The commission. Images are data URIs (user uploads, vision models only). */
  request: { text: string; images?: string[] };
  /** The fulfilment. Null when the job failed before any text arrived. */
  reply: { text: string; images: string[]; sources: SourceRef[] } | null;
  provenance: Provenance;
  status: 'done' | 'error';
  error?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  exchanges: Exchange[];
};

export type Prefs = { planId?: string; deepThinking?: boolean };

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 48 ? clean.slice(0, 45).trimEnd() + '…' : clean || 'untitled';
}

export function loadLedger(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (parsed && parsed.v === 1 && Array.isArray(parsed.convs)) return parsed.convs;
    return [];
  } catch {
    return [];
  }
}

// Images are large base64 payloads that can blow the ~5MB localStorage quota.
// On quota failure retry with generated images stripped, then with request
// images stripped too — keeping the text ledger beats losing persistence.
export function saveLedger(convs: Conversation[]): void {
  if (typeof window === 'undefined') return;
  const write = (c: Conversation[]) => localStorage.setItem(LEDGER_KEY, JSON.stringify({ v: 1, convs: c }));
  try {
    write(convs);
  } catch {
    try {
      const noReplyImages = convs.map(c => ({
        ...c,
        exchanges: c.exchanges.map(x => x.reply ? { ...x, reply: { ...x.reply, images: [] } } : x),
      }));
      write(noReplyImages);
    } catch {
      try {
        const textOnly = convs.map(c => ({
          ...c,
          exchanges: c.exchanges.map(x => ({
            ...x,
            request: { text: x.request.text },
            reply: x.reply ? { ...x.reply, images: [] } : null,
          })),
        }));
        write(textOnly);
      } catch (err) {
        console.error('c3 ledger: persistence failed', err);
      }
    }
  }
}

export function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function savePrefs(p: Prefs): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch { /* prefs are best-effort */ }
}

export function fmtElapsed(ms: number): string {
  if (ms < 0) return '0s';
  if (ms < 10000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function fmtUnitNumber(index: number): string {
  return `№ ${String(index + 1).padStart(3, '0')}`;
}

'use client';

// The data behind the usage panel, and an honest account of where it comes
// from. Two sources and nothing between them:
//
//   live  — the signed-in account. /api/credits carries the balance, the free
//           prompt state and the last 20 credit transactions; /api/usage
//           carries the per-model request and token totals. A running balance
//           is walked backwards from the current balance through those
//           transactions, so it is derived, not guessed.
//   demo  — the preview set at the bottom of this file, reachable only while
//           NEXT_PUBLIC_PREVIEW_MODE is on AND no live data arrived. Every API
//           fails in the preview, so without it there is nothing to judge.
//
// Anything neither source carries — a full daily history, a per-model credit
// cost — is returned as null, and the views render a labelled empty state for
// it. Nothing on screen in production is invented here.
import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import type { ChatEngine } from '../../engine/useChatEngine';
import { DEMO_MODE } from '../../demo';
import { PLANS } from '../../lib';

export type Variant = 1 | 2 | 3;

/** One day of activity. `day` is a local YYYY-MM-DD key. */
export interface UsageDay { day: string; prompts: number; credits: number }

/** One credit movement. `balance` is the balance after it, or null if unknown. */
export interface UsageEntry {
  id: string;
  at: number;
  kind: 'spend' | 'deposit' | 'refund';
  label: string;
  credits: number;
  balance: number | null;
}

export interface ModelUse { model: string; prompts: number; tokens: number }

export interface UsageData {
  loading: boolean;
  /** Everything on screen is the preview demo set. */
  demo: boolean;
  balance: number | null;
  freePrompts: number | null;
  freeLimit: number | null;
  stakerAllowance: number;
  /** Daily counts, or null when there is no history to draw. */
  days: UsageDay[] | null;
  /** `days` only reaches as far back as the recent activity window. */
  partial: boolean;
  /** Recent credit movements, newest first, or null when there are none. */
  entries: UsageEntry[] | null;
  /** Per-model totals, or null when the account has no record yet. */
  models: ModelUse[] | null;
}

// ---------- formatting ----------

const GROUP = new Intl.NumberFormat('en-US');
export const fmt = (n: number) => GROUP.format(Math.round(n));

/** Local YYYY-MM-DD. Date.toISOString() would shift the day in half the world. */
export function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3));

/** "12 March" */
export const longDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** "Today", "Yesterday", or "12 March". */
export function dayLabel(key: string): string {
  const today = dayKey(new Date());
  if (key === today) return 'Today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === dayKey(y)) return 'Yesterday';
  return longDate(fromKey(key));
}

/** 24-hour clock, for rows a day heading already dates. */
export const clockTime = (at: number) =>
  new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function relTime(at: number): string {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? 'month' : 'months'} ago`;
}

/** What was spent, and on how many prompts, over the last `days` days. */
export function recentSpend(entries: UsageEntry[], days: number): { credits: number; prompts: number } {
  const since = Date.now() - days * 86400000;
  const rows = entries.filter(e => e.kind === 'spend' && e.at >= since);
  return { credits: rows.reduce((n, e) => n + e.credits, 0), prompts: rows.length };
}

/** Days between the first and last prompt of the current run, counting today. */
export function currentStreak(days: UsageDay[]): number {
  const byDay = new Map(days.map(d => [d.day, d.prompts]));
  const cursor = new Date();
  let run = 0;
  // a day that has not been used yet does not break the run
  if ((byDay.get(dayKey(cursor)) ?? 0) === 0) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    if ((byDay.get(dayKey(cursor)) ?? 0) === 0) break;
    run++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return run;
}

/** A balance after each movement, walked back from the balance now. */
function walkBalances(entries: Omit<UsageEntry, 'balance'>[], now: number | null): UsageEntry[] {
  let running = now;
  return entries.map(e => {
    const at = running;
    if (running !== null) running = e.kind === 'spend' ? running + e.credits : running - e.credits;
    return { ...e, balance: at };
  });
}

function toDays(entries: UsageEntry[]): UsageDay[] {
  const acc = new Map<string, UsageDay>();
  for (const e of entries) {
    if (e.kind !== 'spend') continue;
    const key = dayKey(new Date(e.at));
    const row = acc.get(key) ?? { day: key, prompts: 0, credits: 0 };
    row.prompts += 1;
    row.credits += e.credits;
    acc.set(key, row);
  }
  return [...acc.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// ---------- the hook ----------

interface Remote {
  usage: { totalRequests?: number; totalTokens?: number; byModel?: { model: string; requests: number; tokens: number }[] } | null;
  credits: {
    balance?: number;
    freePromptsRemaining?: number;
    freePromptLimit?: number;
    recentTransactions?: { id: string; type: string; amount: number; description?: string | null; created_at: string }[];
  } | null;
}

export function useUsage(engine: ChatEngine): UsageData {
  const { getAccessToken } = usePrivy();
  const [remote, setRemote] = useState<Remote | null>(null);
  const [loading, setLoading] = useState(() => engine.isAuthenticated);

  useEffect(() => {
    if (!engine.isAuthenticated) return;
    let off = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('no access token');
        const headers = { Authorization: `Bearer ${token}` };
        const [u, c] = await Promise.all([
          fetch('/api/usage', { headers }),
          fetch('/api/credits', { headers }),
        ]);
        const next: Remote = {
          usage: u.ok ? await u.json() : null,
          credits: c.ok ? await c.json() : null,
        };
        if (!off) setRemote(next);
      } catch {
        if (!off) setRemote({ usage: null, credits: null });
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => { off = true; };
  }, [engine.isAuthenticated, getAccessToken]);

  const credits = engine.credits;

  return useMemo<UsageData>(() => {
    const live = !!(remote?.usage || remote?.credits);

    if (DEMO_MODE && !live) {
      const set = demoSet();
      return {
        loading: false,
        demo: true,
        balance: credits.balance ?? set.balance,
        freePrompts: credits.freePrompts ?? set.freePrompts,
        freeLimit: credits.freeLimit ?? set.freeLimit,
        stakerAllowance: credits.stakerAllowance || set.stakerAllowance,
        days: set.days,
        partial: false,
        entries: set.entries,
        models: set.models,
      };
    }

    const balance = credits.balance ?? remote?.credits?.balance ?? null;

    const txns = remote?.credits?.recentTransactions ?? [];
    const parsed = txns
      .map(t => ({
        id: String(t.id),
        at: Date.parse(t.created_at),
        kind: (t.type === 'deposit' || t.type === 'refund' ? t.type : 'spend') as UsageEntry['kind'],
        label: t.description?.trim() || (t.type === 'deposit' ? 'Credit deposit' : 'Prompt'),
        credits: Math.abs(Number(t.amount) || 0),
      }))
      .filter(t => Number.isFinite(t.at))
      .sort((a, b) => b.at - a.at);
    const entries = parsed.length ? walkBalances(parsed, balance) : null;

    const byModel = remote?.usage?.byModel ?? [];
    const models = byModel.length
      ? byModel.map(m => ({ model: m.model, prompts: m.requests, tokens: m.tokens }))
      : null;

    const days = entries ? toDays(entries) : null;

    return {
      loading,
      demo: false,
      balance,
      freePrompts: credits.freePrompts ?? remote?.credits?.freePromptsRemaining ?? null,
      freeLimit: credits.freeLimit ?? remote?.credits?.freePromptLimit ?? null,
      stakerAllowance: credits.stakerAllowance,
      days: days && days.length ? days : null,
      // the account API returns a window of recent transactions, never a year
      partial: true,
      entries,
      models,
    };
  }, [remote, loading, credits]);
}

// ---------- which variant is on screen ----------

const VARIANT_KEY = 'cu_usage';
const asVariant = (v: string | null): Variant | null => (v === '1' || v === '2' || v === '3' ? (Number(v) as Variant) : null);

export function useUsageVariant(): [Variant, (v: Variant) => void] {
  const [variant, setVariant] = useState<Variant>(1);

  // localStorage and the query string are readable only after mount, the same
  // one-shot hydrate the conversation list uses in index.tsx
  useEffect(() => {
    const fromQuery = asVariant(new URLSearchParams(window.location.search).get('usage'));
    const chosen = fromQuery ?? asVariant(localStorage.getItem(VARIANT_KEY));
    if (fromQuery) localStorage.setItem(VARIANT_KEY, String(fromQuery));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (chosen) setVariant(chosen);
  }, []);

  const pick = (v: Variant) => {
    setVariant(v);
    try { localStorage.setItem(VARIANT_KEY, String(v)); } catch { /* private mode */ }
  };

  return [variant, pick];
}

// ---------- PREVIEW-ONLY demo set ----------
// Reached only from the DEMO_MODE branch above (NEXT_PUBLIC_PREVIEW_MODE=1),
// and only while no live data arrived. Deterministic, so the panel looks the
// same on every open, and costed from the real model catalog so the credit
// figures are internally consistent. Deleted at flip time with the flag.

interface DemoSet {
  balance: number;
  freePrompts: number;
  freeLimit: number;
  stakerAllowance: number;
  days: UsageDay[];
  entries: UsageEntry[];
  models: ModelUse[];
}

const DEMO_BALANCE = 4820;
const DEMO_SEED = 20260724;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let cached: DemoSet | null = null;

function demoSet(): DemoSet {
  if (cached) return cached;
  const rnd = mulberry32(DEMO_SEED);
  const catalog = PLANS.map(p => ({ name: p.name, cost: p.cost }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const days: UsageDay[] = [];
  const perModel = new Map<string, ModelUse>();
  const raw: { at: number; label: string; credits: number }[] = [];

  for (let back = 370; back >= 0; back--) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    // the account gets busier over the year, and quieter at weekends
    const ramp = 0.3 + 0.7 * ((370 - back) / 370);
    const idle = rnd() < (weekend ? 0.72 : 0.3) * (1.3 - ramp);
    const burst = rnd() < 0.03 ? 2.6 : 1;
    const prompts = idle ? 0 : Math.max(1, Math.round((1 + rnd() * 13) * ramp * burst * (weekend ? 0.5 : 1)));

    let credits = 0;
    for (let i = 0; i < prompts; i++) {
      const model = catalog[Math.floor(rnd() * catalog.length)];
      credits += model.cost;
      const row = perModel.get(model.name) ?? { model: model.name, prompts: 0, tokens: 0 };
      row.prompts += 1;
      row.tokens += 380 + Math.round(rnd() * 1500);
      perModel.set(model.name, row);
      // only the recent window becomes a ledger, the way the account API works
      if (back <= 9) {
        const at = new Date(d);
        at.setHours(8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), 0, 0);
        raw.push({ at: at.getTime(), label: model.name, credits: model.cost });
      }
    }
    days.push({ day: dayKey(d), prompts, credits });
  }

  const now = Date.now();
  const movements: Omit<UsageEntry, 'balance'>[] = raw
    .filter(r => r.at <= now)
    .map((r, i) => ({ id: `demo-${i}`, at: r.at, kind: 'spend', label: r.label, credits: r.credits }));
  // one top-up, so the ledger shows both directions
  const topUp = new Date(today);
  topUp.setDate(topUp.getDate() - 6);
  topUp.setHours(10, 12, 0, 0);
  movements.push({ id: 'demo-topup', at: topUp.getTime(), kind: 'deposit', label: 'Credit top-up', credits: 2000 });
  const ordered = movements.sort((a, b) => b.at - a.at).slice(0, 40);

  cached = {
    balance: DEMO_BALANCE,
    freePrompts: 2,
    freeLimit: 5,
    stakerAllowance: 40,
    days,
    entries: walkBalances(ordered, DEMO_BALANCE),
    models: [...perModel.values()].sort((a, b) => b.prompts - a.prompts),
  };
  return cached;
}

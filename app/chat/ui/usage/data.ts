'use client';

// The data behind the usage panel, and an honest account of where it comes
// from. Two sources and nothing between them:
//
//   live  — the signed-in account. /api/credits carries the balance, the two
//           free lanes (the one-time welcome grant and the daily staking
//           allowance) and a window of credit transactions, which are what the
//           daily squares are counted from; /api/usage carries the per-model
//           request and token totals.
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

/** One day of activity. `day` is a local YYYY-MM-DD key. */
export interface UsageDay { day: string; prompts: number; credits: number }

/** One credit movement, as the account records it. A prompt the treasury paid
 *  for — the welcome grant, the staking allowance — records as a spend of 0,
 *  so it counts as a prompt in the squares without moving any credit figure. */
interface UsageEntry {
  at: number;
  kind: 'spend' | 'deposit' | 'refund';
  credits: number;
}

export interface ModelUse { model: string; prompts: number; tokens: number }

/** The daily staking lane, in credits. `daily` is 0 for an account with no
 *  matured stake, which is what puts the lane in its empty state. */
export interface StakerLane { enabled: boolean; daily: number; remaining: number }

export interface UsageData {
  loading: boolean;
  /** Everything on screen is the preview demo set. */
  demo: boolean;
  balance: number | null;
  /** The one-time welcome grant. It is never topped up. */
  freePrompts: number | null;
  freeLimit: number | null;
  /** The network's free-prompt budget is spent for today, so the welcome grant
   *  is not being issued even to an account that still has some left. */
  freePromptsPaused: boolean;
  staker: StakerLane;
  /** What a Pro prompt costs, so a credit figure can be said in prompts. */
  proCost: number | null;
  /** Daily counts, or null when there is no history to draw. */
  days: UsageDay[] | null;
  /** `days` only reaches as far back as the recent activity window. */
  partial: boolean;
  /** Per-model totals, or null when the account has no record yet. */
  models: ModelUse[] | null;
}

/** How many transactions the panel asks /api/credits for. A full year of them
 *  for most accounts; a heavy account hits the ceiling and the grid says so. */
const TX_WINDOW = 500;

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
    freePromptsPaused?: boolean;
    stakerAllowance?: { enabled?: boolean; dailyAllowance?: number; remaining?: number };
    config?: { tierCredits?: { pro?: number } };
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
          fetch(`/api/credits?tx=${TX_WINDOW}`, { headers }),
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
        freePromptsPaused: false,
        staker: set.staker,
        proCost: set.proCost,
        days: set.days,
        partial: false,
        models: set.models,
      };
    }

    const rows = remote?.credits?.recentTransactions ?? [];
    const entries: UsageEntry[] = rows
      .map(t => ({
        at: Date.parse(t.created_at),
        kind: (t.type === 'deposit' || t.type === 'refund' ? t.type : 'spend') as UsageEntry['kind'],
        credits: Math.abs(Number(t.amount) || 0),
      }))
      .filter(t => Number.isFinite(t.at));

    const byModel = remote?.usage?.byModel ?? [];
    const models = byModel.length
      ? byModel.map(m => ({ model: m.model, prompts: m.requests, tokens: m.tokens }))
      : null;

    const days = toDays(entries);
    const sa = remote?.credits?.stakerAllowance;

    return {
      loading,
      demo: false,
      balance: credits.balance ?? remote?.credits?.balance ?? null,
      freePrompts: credits.freePrompts ?? remote?.credits?.freePromptsRemaining ?? null,
      freeLimit: credits.freeLimit ?? remote?.credits?.freePromptLimit ?? null,
      freePromptsPaused: remote?.credits?.freePromptsPaused === true,
      staker: {
        enabled: sa?.enabled === true,
        daily: sa?.dailyAllowance ?? 0,
        remaining: sa?.remaining ?? credits.stakerAllowance,
      },
      proCost: remote?.credits?.config?.tierCredits?.pro ?? null,
      days: days.length ? days : null,
      // the window is a ceiling, not a year: only a full page means there is
      // older activity the squares cannot see
      partial: rows.length >= TX_WINDOW,
      models,
    };
  }, [remote, loading, credits]);
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
  staker: StakerLane;
  proCost: number;
  days: UsageDay[];
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
    }
    days.push({ day: dayKey(d), prompts, credits });
  }

  const proCost = PLANS[0].cost; // cheapest (only) chat model — drives the "prompts left" estimate
  cached = {
    balance: DEMO_BALANCE,
    freePrompts: 2,
    freeLimit: 5,
    staker: { enabled: true, daily: 400, remaining: 260 },
    proCost,
    days,
    models: [...perModel.values()].sort((a, b) => b.prompts - a.prompts),
  };
  return cached;
}

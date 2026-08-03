'use client';

// Usage and credits, as an overlay rather than a page: scrim, one solid panel
// on --cu-pop, escape and backdrop to leave. Same idiom as the command
// palette, so it reads as part of the interface rather than a visit somewhere
// else.
//
// It answers three questions in the order they get asked. What have I got —
// the balance, then the two free lanes that get spent before it. How have I
// been using it — the year, as squares. What on — the models. Every figure
// appears once.
import { useEffect } from 'react';
import type { ChatEngine } from '../../engine/useChatEngine';
import { X } from '../Icons';
import { fmt, useUsage, type ModelUse, type UsageData } from './data';
import { Empty, credits } from './parts';
import Grid from './Grid';

export default function UsagePanel({ engine, onClose }: { engine: ChatEngine; onClose: () => void }) {
  const data = useUsage(engine);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signedOut = !engine.isAuthenticated && !data.demo;

  return (
    <div className="cu-fade fixed inset-0 z-50 flex items-end justify-center md:items-start md:pt-[10vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Usage and credits"
        className="relative z-10 flex max-h-[84vh] w-full flex-col overflow-hidden rounded-t-[24px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] md:max-h-[80vh] md:w-[46rem] md:rounded-[24px]"
        style={{ background: 'var(--cu-pop)' }}
      >
        <div className="flex items-center gap-3 px-5 pb-3 pt-4">
          <span className="text-[13px]" style={{ color: 'var(--cu-dim)' }}>Usage</span>
          {data.demo && (
            <span className="shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px]" style={{ background: 'var(--cu-surface)', color: 'var(--cu-faint)' }}>
              Demo data
            </span>
          )}
          <span className="ml-auto hidden text-[12px] md:block" style={{ color: 'var(--cu-faint)' }}>esc</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-white/40 hover:bg-white/[0.06] hover:text-white/80 md:hidden"
          ><X /></button>
        </div>

        <div className="cu-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-1">
          {data.loading ? (
            <p className="py-8 text-[13px]" style={{ color: 'var(--cu-faint)' }}>Reading your account.</p>
          ) : signedOut ? (
            <SignedOut engine={engine} />
          ) : (
            <>
              <Balance data={data} />
              <Lanes data={data} />
              <Grid data={data} />
              <ByModel models={data.models} />
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 pb-4 pt-4 text-[12px]" style={{ color: 'var(--cu-faint)' }}>
          <a href="/settings#usage" className="transition-colors hover:text-white/70">Full account usage</a>
        </div>
      </div>
    </div>
  );
}

/** The opening statement, and the only serif in the panel. */
function Balance({ data }: { data: UsageData }) {
  return (
    <div className="flex items-baseline gap-2.5 pt-1">
      <span className="pixel-serif text-[52px] leading-none tabular-nums" style={{ color: 'var(--cu-text)' }}>
        {credits(data.balance)}
      </span>
      <span className="text-[13px]" style={{ color: 'var(--cu-dim)' }}>credits</span>
    </div>
  );
}

/** The lanes a prompt is paid from, in the order the server drains them: the
 *  one-time welcome grant, then today's staking allowance, then the balance
 *  above. Each bar fills with what is left, and each lane states its own
 *  reset — or states that it has none. */
function Lanes({ data }: { data: UsageData }) {
  const welcome = data.freeLimit !== null && data.freeLimit > 0;
  if (!welcome && !data.staker.enabled) return null;

  return (
    <div className="space-y-4">
      {welcome && <Welcome data={data} />}
      {data.staker.enabled && <Staking data={data} />}
      <p className="text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>
        A prompt spends {welcome && 'the welcome grant first, then '}
        {data.staker.enabled && 'today’s allowance, then '}the balance above.
      </p>
    </div>
  );
}

/** Given once when the account is created and never topped up, which is why
 *  nothing in this lane says "today". */
function Welcome({ data }: { data: UsageData }) {
  const { freePrompts: left, freeLimit: limit } = data;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span style={{ color: 'var(--cu-dim)' }}>Welcome prompts</span>
        <span className="tabular-nums" style={{ color: 'var(--cu-faint)' }}>
          {left === null || limit === null ? 'unavailable' : `${left} of ${limit} left`}
        </span>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--cu-surface)' }}>
        {left !== null && limit !== null && limit > 0 && left > 0 && (
          <div style={{ width: `${Math.min(100, (left / limit) * 100)}%`, background: 'var(--cu-live)' }} />
        )}
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>
        A one-time grant for a new account. It does not refresh.
      </p>
      {data.freePromptsPaused && (left ?? 0) > 0 && (
        <p className="mt-1 text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>
          Paused today — the network has reached its free-prompt cap.
        </p>
      )}
    </div>
  );
}

/** Credits, not prompts: the allowance is a share of a network-wide pool and
 *  buys whatever the tier costs. The prompt figure under it says so. */
function Staking({ data }: { data: UsageData }) {
  const { daily, remaining } = data.staker;

  if (daily <= 0) {
    return (
      <div>
        <div className="text-[12px]" style={{ color: 'var(--cu-dim)' }}>Daily staking allowance</div>
        <p className="mt-2 text-[11.5px]" style={{ color: 'var(--cu-faint)' }}>
          <a href="/staking" className="transition-colors hover:text-white/70" style={{ color: 'var(--cu-dim)' }}>Stake $ZERO for a daily allowance</a>
          {' '}of credits, shared out pro rata among stakers.
        </p>
      </div>
    );
  }

  const prompts = data.proCost && data.proCost > 0 ? Math.floor(remaining / data.proCost) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]">
        <span style={{ color: 'var(--cu-dim)' }}>Daily staking allowance</span>
        <span className="tabular-nums" style={{ color: 'var(--cu-faint)' }}>
          {fmt(remaining)} of {fmt(daily)} credits left
        </span>
      </div>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--cu-surface)' }}>
        {remaining > 0 && (
          <div style={{ width: `${Math.min(100, (remaining / daily) * 100)}%`, background: 'var(--cu-live)' }} />
        )}
      </div>
      <p className="mt-2 text-[11.5px] tabular-nums" style={{ color: 'var(--cu-faint)' }}>
        {prompts === null
          ? 'Resets 00:00 UTC.'
          : `≈ ${prompts} Pro ${prompts === 1 ? 'prompt' : 'prompts'} left · resets 00:00 UTC`}
      </p>
    </div>
  );
}

/** One stacked bar, then the counts under it. Steel at four weights, because
 *  the emerald belongs to the grid. */
function ByModel({ models }: { models: ModelUse[] | null }) {
  const shown = (models ?? []).slice(0, 4);
  const total = shown.reduce((n, m) => n + m.prompts, 0) || 1;
  const shades = ['rgba(128,160,193,0.95)', 'rgba(128,160,193,0.7)', 'rgba(128,160,193,0.45)', 'rgba(128,160,193,0.25)'];

  return (
    <div>
      <div className="text-[12px]" style={{ color: 'var(--cu-dim)' }}>By model</div>
      {shown.length === 0 ? (
        <div className="mt-2.5"><Empty title="There is no per-model record yet." /></div>
      ) : (
        <div className="mt-2.5">
          <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full">
            {shown.map((m, i) => (
              <div key={m.model} style={{ width: `${(m.prompts / total) * 100}%`, background: shades[i] }} />
            ))}
          </div>
          <div className="mt-2.5 space-y-1">
            {shown.map((m, i) => (
              <div key={m.model} className="flex items-baseline gap-2 text-[12.5px]">
                <span className="h-[6px] w-[6px] shrink-0 translate-y-[-1px] rounded-[1px]" style={{ background: shades[i] }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--cu-dim)' }}>{m.model}</span>
                <span className="tabular-nums" style={{ color: 'var(--cu-faint)' }}>{fmt(m.prompts)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** The free lane, stated plainly. Nothing is drawn for an account that has not
 *  signed in, because there is nothing real to draw. */
function SignedOut({ engine }: { engine: ChatEngine }) {
  return (
    <div className="py-6">
      <p className="text-[15px]" style={{ color: 'var(--cu-text)' }}>
        {engine.anonRemaining !== null
          ? `${engine.anonRemaining} free ${engine.anonRemaining === 1 ? 'prompt' : 'prompts'} left in this browser`
          : 'Free prompts are running in this browser'}
      </p>
      <p className="mt-2 text-[13px]" style={{ color: 'var(--cu-dim)' }}>
        Sign in to keep a balance, see what you have spent, and take the daily allowance that staking gives you.
      </p>
      <button
        onClick={engine.login}
        className="cu-chip mt-4 px-4 py-2 text-[13.5px]"
        style={{ color: 'var(--cu-text)' }}
      >Sign in</button>
    </div>
  );
}

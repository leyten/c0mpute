'use client';

// Usage and credits, as an overlay rather than a page: scrim, one solid panel
// on --cu-pop, escape and backdrop to leave. Same idiom as the command
// palette, so it reads as part of the interface rather than a visit somewhere
// else. Three variants are switchable while the owner decides which one stays;
// ?usage=1|2|3 picks one and it is remembered under cu_usage.
import { useEffect } from 'react';
import type { ChatEngine } from '../../engine/useChatEngine';
import { X } from '../Icons';
import { useUsage, useUsageVariant, type Variant } from './data';
import Grid from './Grid';
import Ledger from './Ledger';
import Meter from './Meter';

const WIDTH: Record<Variant, string> = {
  1: 'md:w-[46rem]',
  2: 'md:w-[38rem]',
  3: 'md:w-[32rem]',
};

export default function UsagePanel({ engine, onClose }: { engine: ChatEngine; onClose: () => void }) {
  const [variant, setVariant] = useUsageVariant();
  const data = useUsage(engine);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signedOut = !engine.isAuthenticated && !data.demo;

  return (
    <div className="cu-fade fixed inset-0 z-50 flex items-end justify-center md:items-start md:pt-[11vh]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Usage and credits"
        className={`relative z-10 flex max-h-[84vh] w-full flex-col overflow-hidden rounded-t-[24px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] md:max-h-[76vh] md:rounded-[24px] ${WIDTH[variant]}`}
        style={{ background: 'var(--cu-pop)' }}
      >
        <div className="flex items-center gap-3 px-5 pb-4 pt-4">
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

        <div className="cu-scroll min-h-0 flex-1 overflow-y-auto px-5 pb-1">
          {data.loading ? (
            <p className="py-8 text-[13px]" style={{ color: 'var(--cu-faint)' }}>Reading your account.</p>
          ) : signedOut ? (
            <SignedOut engine={engine} />
          ) : variant === 1 ? (
            <Grid data={data} />
          ) : variant === 2 ? (
            <Ledger data={data} />
          ) : (
            <Meter data={data} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 pb-4 pt-4 text-[12px]" style={{ color: 'var(--cu-faint)' }}>
          <a href="/settings#usage" className="transition-colors hover:text-white/70">Full account usage</a>
          <a href="/staking" className="transition-colors hover:text-white/70">Daily allowance from staking</a>
        </div>
      </div>

      {/* preview only: the same pill the owner switches variants with elsewhere */}
      <div className="variant-switcher cu-usage-switch">
        {([1, 2, 3] as Variant[]).map(n => (
          <button key={n} className={n === variant ? 'on' : ''} onClick={() => setVariant(n)} aria-label={`Variant ${n}`}>{n}</button>
        ))}
      </div>
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

'use client';

// Variation B — the panel becomes an instrument once it runs. Same toggle,
// same resting state, but a running browser worker turns the card into a
// readout: throughput per completed job, drawn from the session log, plus the
// running totals. Nothing is drawn that the engine did not report.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, NODE_INSTALL, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from '../shared';
import type { SessionJob } from '../engine/useWorkerEngine';

type Tab = 'browser' | 'machine';

/** Tokens per second for each completed job, oldest on the left. One bar per
 *  job actually served — no interpolation, no padding to a fixed width. */
function Throughput({ jobs }: { jobs: SessionJob[] }) {
  const done = jobs.filter(j => j.status === 'completed' && j.ms > 0).slice(0, 24).reverse();
  if (done.length === 0) {
    return <div className="h-[68px] rounded-xl border border-white/[0.06] bg-white/[0.015]" />;
  }
  const rates = done.map(j => (j.tokens / j.ms) * 1000);
  const peak = Math.max(...rates);
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3 pb-2 pt-3">
      <div className="flex h-[44px] items-end gap-[3px]">
        {rates.map((r, i) => (
          <div
            key={i}
            className="min-w-[4px] flex-1 rounded-[2px] transition-[height] duration-300"
            style={{ height: `${Math.max(8, (r / peak) * 100)}%`, background: i === rates.length - 1 ? 'rgba(52,211,153,0.85)' : 'rgba(128,160,193,0.45)' }}
            title={`${r.toFixed(1)} tok/s`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] tabular-nums text-white/30">
        <span>{done.length} {done.length === 1 ? 'job' : 'jobs'} this session</span>
        <span>peak {peak.toFixed(1)} tok/s</span>
      </div>
    </div>
  );
}

export default function EarnReadout() {
  const engine = useWorkerEngine();
  const { running, blocked } = useEarnControls(engine);
  const cmd = useNativeCommand(engine);
  const os = usePlatform();
  const [tab, setTab] = useState<Tab>('browser');
  const native = engine.nativeStatus;
  const online = native?.online === true;
  const live = engine.status === 'ready' || engine.status === 'working';

  if (engine.authLoading) return <Screen><div /></Screen>;

  return (
    <Screen>
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-[38rem]">
          <h1 className="pixel-serif text-center text-[28px] leading-tight text-white md:text-[34px]">
            Put your GPU to work.
          </h1>

          <div className="mx-auto mt-6 flex w-fit rounded-full border border-white/10 bg-white/[0.03] p-1">
            {([['browser', 'In this browser'], ['machine', 'On my machine']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`cursor-pointer rounded-full px-5 py-2 text-[13.5px] transition-colors ${tab === key ? 'bg-white text-black' : 'text-white/55 hover:text-white/85'}`}>
                {label}
                {((key === 'browser' && running) || (key === 'machine' && online)) && <span className="ml-2"><Dot on /></span>}
              </button>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-7">
            {tab === 'browser' ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="pixel-serif text-[24px] text-white">
                    {engine.model.payout.split('/')[0]} <span className="text-[13px] text-white/45">per job</span>
                  </span>
                  {running && <span className="text-[12.5px] text-white/45"><Dot on={live} /> {PHASE[engine.status]}</span>}
                </div>

                {live ? (
                  <>
                    <div className="mt-5"><Throughput jobs={engine.sessionJobs} /></div>
                    <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                      <Stat label="Jobs" value={String(engine.session.jobsCompleted)} />
                      <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
                      <Stat label="Serving" value={fmtUptime(engine.uptimeSeconds)} />
                      <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">{browserNote(engine)}</p>
                )}

                {engine.status === 'downloading' && (
                  <div className="mt-5">
                    <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: '#80a0c1' }} />
                    </div>
                    <div className="mt-2 text-[12px] tabular-nums text-white/40">{Math.round(engine.loadProgress * 100)}%</div>
                  </div>
                )}

                {engine.error && <p className="mt-4 text-[13px]" style={{ color: '#fca5a5' }}>{engine.error}</p>}

                <div className="mt-6">
                  {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to start</Button>
                    : running ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                    : <Button onClick={engine.start} disabled={blocked}>Start earning</Button>}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="pixel-serif text-[24px] text-white">{NATIVE_RATE} <span className="text-[13px] text-white/45">per job</span></span>
                  {online && <span className="text-[12.5px] text-white/45"><Dot on /> Connected</span>}
                </div>

                {online && native ? (
                  <div className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                    <Stat label="Jobs completed" value={native.jobsCompleted.toLocaleString()} />
                    <Stat label="Tokens" value={native.tokensGenerated.toLocaleString()} />
                    <Stat label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
                  </div>
                ) : (
                  <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">
                    A 27B model on your own GPU, in the background. Up to 10x a browser worker.
                    Needs Node.js 18 and an NVIDIA, AMD or Apple Silicon GPU.
                  </p>
                )}

                {cmd.failed && <p className="mt-4 text-[13px]" style={{ color: '#fca5a5' }}>{cmd.failed}</p>}

                <div className="mt-6">
                  {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to get a command</Button>
                    : cmd.token ? <CommandBox command={cmd.command} copied={cmd.copied} onCopy={cmd.copy} />
                    : <Button onClick={() => void cmd.issue()} disabled={cmd.busy}>{cmd.busy ? 'Issuing…' : 'Get my command'}</Button>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/35">
                  <span>No Node.js?</span>
                  <code className="font-mono text-white/45">{NODE_INSTALL[os]}</code>
                  {cmd.token && <Link href="/settings#worker" className="underline underline-offset-2 hover:text-white/60">Manage tokens</Link>}
                </div>

                <p className="mt-4 text-[12.5px] text-white/35">{SWARM_NOTE}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}

function fmtUptime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
}

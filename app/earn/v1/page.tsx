'use client';

// Version 1 — RAIL. The switch is a vertical nav on the left, the way a
// settings screen works. The pane on the right gets the whole rest of the
// screen, so this is the one with room for detail: the browser worker shows a
// throughput bar per completed job, the native side shows its full setup.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine, type SessionJob } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, NODE_INSTALL, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from '../shared';

type Tab = 'browser' | 'machine';

/** One bar per job actually served, height is that job's tokens per second. */
function Throughput({ jobs }: { jobs: SessionJob[] }) {
  const done = jobs.filter(j => j.status === 'completed' && j.ms > 0).slice(0, 28).reverse();
  if (done.length === 0) return null;
  const rates = done.map(j => (j.tokens / j.ms) * 1000);
  const peak = Math.max(...rates);
  return (
    <div className="mt-6 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 pb-2.5 pt-4">
      <div className="flex h-[52px] items-end gap-[3px]">
        {rates.map((r, i) => (
          <div key={i} className="min-w-[4px] flex-1 rounded-[2px] transition-[height] duration-300"
            style={{ height: `${Math.max(8, (r / peak) * 100)}%`, background: i === rates.length - 1 ? 'rgba(52,211,153,0.85)' : 'rgba(128,160,193,0.45)' }}
            title={`${r.toFixed(1)} tok/s`} />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10.5px] tabular-nums text-white/30">
        <span>{done.length} {done.length === 1 ? 'job' : 'jobs'} this session</span>
        <span>peak {peak.toFixed(1)} tok/s</span>
      </div>
    </div>
  );
}

export default function EarnRail() {
  const engine = useWorkerEngine();
  const { running, blocked } = useEarnControls(engine);
  const cmd = useNativeCommand(engine);
  const os = usePlatform();
  const [tab, setTab] = useState<Tab>('browser');
  const native = engine.nativeStatus;
  const online = native?.online === true;
  const live = engine.status === 'ready' || engine.status === 'working';

  if (engine.authLoading) return <Screen><div /></Screen>;

  const items = [
    { key: 'browser' as const, label: 'In this browser', meta: engine.model.payout.split('/')[0], on: running },
    { key: 'machine' as const, label: 'On my machine', meta: NATIVE_RATE, on: online },
  ];

  return (
    <Screen>
      <div className="flex flex-1 flex-col md:flex-row">
        {/* the switch */}
        <nav className="shrink-0 border-b border-white/[0.07] px-6 py-6 md:w-[17rem] md:border-b-0 md:border-r md:px-5 md:py-10">
          <div className="mb-6 px-3 text-[10px] uppercase tracking-[0.14em] text-white/35">Supply the network</div>
          <div className="flex gap-2 md:flex-col">
            {items.map(it => (
              <button key={it.key} onClick={() => setTab(it.key)}
                className={`flex-1 cursor-pointer rounded-xl px-3 py-3 text-left transition-colors ${tab === it.key ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}>
                <div className="flex items-center gap-2">
                  <Dot on={it.on} />
                  <span className="text-[14px]" style={{ color: tab === it.key ? '#fff' : 'rgba(255,255,255,0.55)' }}>{it.label}</span>
                </div>
                <div className="mt-1 pl-3.5 text-[12px] text-white/35">{it.meta} per job</div>
              </button>
            ))}
          </div>
        </nav>

        {/* the pane */}
        <div className="flex flex-1 items-center px-7 py-10 md:px-14">
          <div className="w-full max-w-[34rem]">
            {tab === 'browser' ? (
              <>
                <h1 className="pixel-serif text-[30px] leading-tight text-white md:text-[36px]">Start in a tab.</h1>
                {live
                  ? <p className="mt-3 text-[14.5px] text-white/55"><Dot on /> {PHASE[engine.status]}</p>
                  : <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">{browserNote(engine)}</p>}

                {engine.status === 'downloading' && (
                  <div className="mt-6">
                    <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: '#80a0c1' }} />
                    </div>
                    <div className="mt-2 text-[12px] tabular-nums text-white/40">{Math.round(engine.loadProgress * 100)}%</div>
                  </div>
                )}

                {live && (
                  <>
                    <Throughput jobs={engine.sessionJobs} />
                    <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                      <Stat label="Jobs" value={String(engine.session.jobsCompleted)} />
                      <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
                      <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
                    </div>
                  </>
                )}

                {engine.error && <p className="mt-5 text-[13px]" style={{ color: '#fca5a5' }}>{engine.error}</p>}

                <div className="mt-7">
                  {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to start</Button>
                    : running ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                    : <Button onClick={engine.start} disabled={blocked}>Start earning</Button>}
                </div>
              </>
            ) : (
              <>
                <h1 className="pixel-serif text-[30px] leading-tight text-white md:text-[36px]">Run a node.</h1>
                {online && native
                  ? <p className="mt-3 text-[14.5px] text-white/55"><Dot on /> Connected</p>
                  : <p className="mt-3 text-[14.5px] leading-relaxed text-white/55">
                      A 27B model on your own GPU, in the background. Up to 10x a browser worker.
                      Needs Node.js 18 and an NVIDIA, AMD or Apple Silicon GPU.
                    </p>}

                {online && native && (
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                    <Stat label="Jobs completed" value={native.jobsCompleted.toLocaleString()} />
                    <Stat label="Tokens" value={native.tokensGenerated.toLocaleString()} />
                    <Stat label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
                  </div>
                )}

                {cmd.failed && <p className="mt-5 text-[13px]" style={{ color: '#fca5a5' }}>{cmd.failed}</p>}

                <div className="mt-7">
                  {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to get a command</Button>
                    : cmd.token ? <CommandBox command={cmd.command} copied={cmd.copied} onCopy={cmd.copy} />
                    : <Button onClick={() => void cmd.issue()} disabled={cmd.busy}>{cmd.busy ? 'Issuing…' : 'Get my command'}</Button>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/35">
                  <span>No Node.js?</span>
                  <code className="font-mono text-white/45">{NODE_INSTALL[os]}</code>
                  {cmd.token && <Link href="/settings#worker" className="underline underline-offset-2 hover:text-white/60">Manage tokens</Link>}
                </div>

                <p className="mt-5 text-[12.5px] text-white/35">{SWARM_NOTE}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}

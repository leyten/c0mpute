'use client';

// Variation A — the panel, tightened. The segmented control above a single
// card. Resting state says what it costs and what you get; running state
// replaces the pitch with what the worker is doing. Nothing else changes.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, NODE_INSTALL, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from '../shared';

type Tab = 'browser' | 'machine';

export default function EarnPanel() {
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
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[36rem]">
          <h1 className="pixel-serif text-center text-[30px] leading-tight text-white md:text-[36px]">
            Put your GPU to work.
          </h1>
          <p className="mt-3 text-center text-[14.5px] text-white/55">
            Paid in USDC for every job your machine finishes.
          </p>

          <div className="mx-auto mt-8 flex w-fit rounded-full border border-white/10 bg-white/[0.03] p-1">
            {([['browser', 'In this browser'], ['machine', 'On my machine']] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`cursor-pointer rounded-full px-5 py-2 text-[13.5px] transition-colors ${tab === key ? 'bg-white text-black' : 'text-white/55 hover:text-white/85'}`}>
                {label}
                {((key === 'browser' && running) || (key === 'machine' && online)) && <span className="ml-2"><Dot on /></span>}
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-7 md:p-8">
            {tab === 'browser' ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="pixel-serif text-[24px] text-white">
                    {engine.model.payout.split('/')[0]} <span className="text-[13px] text-white/45">per job</span>
                  </span>
                  {running && <span className="text-[12.5px] text-white/45"><Dot on={live} /> {PHASE[engine.status]}</span>}
                </div>

                {live ? (
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                    <Stat label="Jobs this session" value={String(engine.session.jobsCompleted)} />
                    <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
                    <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
                  </div>
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

                <div className="mt-7">
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
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
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

                <p className="mt-4 text-[12.5px] text-white/35">{SWARM_NOTE}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}

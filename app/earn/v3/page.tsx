'use client';

// Variation C — no pill. The two ways are two serif lines, and the one you
// choose opens beneath it while the other stays a line. Same one-at-a-time
// behaviour, but the choice is the page rather than a control on it.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, NODE_INSTALL, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from '../shared';

type Tab = 'browser' | 'machine';

function Choice({ open, title, meta, live, onOpen, children }: {
  open: boolean; title: string; meta: string; live?: React.ReactNode;
  onOpen: () => void; children: React.ReactNode;
}) {
  return (
    <section className={`border-t border-white/[0.07] transition-colors ${open ? '' : 'hover:bg-white/[0.015]'}`}>
      <button onClick={onOpen} disabled={open}
        className={`flex w-full items-baseline justify-between gap-4 py-5 text-left ${open ? '' : 'cursor-pointer'}`}>
        <span className="pixel-serif text-[24px] leading-tight md:text-[28px]" style={{ color: open ? '#fff' : 'rgba(255,255,255,0.5)' }}>
          {title}
        </span>
        <span className="shrink-0 text-[12.5px] text-white/40">{live ?? meta}</span>
      </button>
      {open && <div className="pb-7">{children}</div>}
    </section>
  );
}

export default function EarnChoice() {
  const engine = useWorkerEngine();
  const { running, blocked } = useEarnControls(engine);
  const cmd = useNativeCommand(engine);
  const os = usePlatform();
  const [tab, setTab] = useState<Tab>('browser');
  const native = engine.nativeStatus;
  const online = native?.online === true;
  const liveNow = engine.status === 'ready' || engine.status === 'working';

  if (engine.authLoading) return <Screen><div /></Screen>;

  return (
    <Screen>
      <div className="mx-auto flex w-full max-w-[40rem] flex-1 flex-col justify-center px-6 py-12">
        <h1 className="pixel-serif text-[30px] leading-tight text-white md:text-[38px]">Two ways to serve.</h1>
        <p className="mb-8 mt-3 text-[14.5px] text-white/55">
          Paid in USDC for every job your machine finishes. Pick one.
        </p>

        <Choice
          open={tab === 'browser'}
          onOpen={() => setTab('browser')}
          title="In this browser"
          meta={engine.model.payout.split('/')[0] + ' per job'}
          live={running ? <span><Dot on={liveNow} /> {PHASE[engine.status]}</span> : undefined}
        >
          {liveNow ? (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Jobs this session" value={String(engine.session.jobsCompleted)} />
              <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
              <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
            </div>
          ) : (
            <p className="text-[14.5px] leading-relaxed text-white/55">{browserNote(engine)}</p>
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
        </Choice>

        <Choice
          open={tab === 'machine'}
          onOpen={() => setTab('machine')}
          title="On my machine"
          meta={`${NATIVE_RATE} per job`}
          live={online ? <span><Dot on /> Connected</span> : undefined}
        >
          {online && native ? (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Jobs completed" value={native.jobsCompleted.toLocaleString()} />
              <Stat label="Tokens" value={native.tokensGenerated.toLocaleString()} />
              <Stat label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
            </div>
          ) : (
            <p className="text-[14.5px] leading-relaxed text-white/55">
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
        </Choice>

        <div className="border-t border-white/[0.07]" />
      </div>
    </Screen>
  );
}

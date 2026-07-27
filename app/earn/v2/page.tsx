'use client';

// Version 2 — FOCUS. No control anywhere. The screen is one worker, centred,
// with the other offered as a single line of text at the bottom. Whichever you
// are looking at owns the whole page; switching is reading one sentence and
// clicking it.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, NODE_INSTALL, PHASE, Screen, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from '../shared';

type Tab = 'browser' | 'machine';

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="pixel-serif text-[30px] tabular-nums leading-none text-white">{value}</div>
      <div className="mt-1.5 text-[11.5px] text-white/40">{label}</div>
    </div>
  );
}

export default function EarnFocus() {
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
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        {tab === 'browser' ? (
          <>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">In this browser</span>
            <h1 className="pixel-serif mt-5 max-w-[20ch] text-[38px] leading-[1.1] text-white md:text-[52px]">
              {live ? 'Your GPU is working.' : 'Lend your GPU.'}
            </h1>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-white/55">
              {live ? PHASE[engine.status] + '.' : browserNote(engine)}
            </p>

            {engine.status === 'downloading' && (
              <div className="mt-7 w-full max-w-[22rem]">
                <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: '#80a0c1' }} />
                </div>
                <div className="mt-2 text-[12px] tabular-nums text-white/40">{Math.round(engine.loadProgress * 100)}%</div>
              </div>
            )}

            {live && (
              <div className="mt-9 flex items-start gap-12">
                <Figure value={String(engine.session.jobsCompleted)} label="Jobs this session" />
                <Figure value={engine.session.tokensGenerated.toLocaleString()} label="Tokens served" />
                <Figure value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} label="Earned today" />
              </div>
            )}

            {engine.error && <p className="mt-6 text-[13px]" style={{ color: '#fca5a5' }}>{engine.error}</p>}

            <div className="mt-9">
              {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to start</Button>
                : running ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                : <Button onClick={engine.start} disabled={blocked}>Start earning · {engine.model.payout.split('/')[0]} a job</Button>}
            </div>
          </>
        ) : (
          <>
            <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: '#80a0c1' }}>On my machine</span>
            <h1 className="pixel-serif mt-5 max-w-[20ch] text-[38px] leading-[1.1] text-white md:text-[52px]">
              {online ? 'Your node is serving.' : 'Run one command.'}
            </h1>
            <p className="mt-4 max-w-[48ch] text-[15px] leading-relaxed text-white/55">
              A 27B model on your own GPU, in the background, at {NATIVE_RATE} a job. Up to 10x a browser worker.
              Needs Node.js 18 and an NVIDIA, AMD or Apple Silicon GPU.
            </p>

            {online && native && (
              <div className="mt-9 flex items-start gap-12">
                <Figure value={native.jobsCompleted.toLocaleString()} label="Jobs completed" />
                <Figure value={native.tokensGenerated.toLocaleString()} label="Tokens served" />
                <Figure value={`${native.tokPerSec.toFixed(1)}`} label="Tokens per second" />
              </div>
            )}

            {cmd.failed && <p className="mt-6 text-[13px]" style={{ color: '#fca5a5' }}>{cmd.failed}</p>}

            <div className="mt-9 w-full max-w-[30rem]">
              {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to get a command</Button>
                : cmd.token ? <CommandBox command={cmd.command} copied={cmd.copied} onCopy={cmd.copy} />
                : <Button onClick={() => void cmd.issue()} disabled={cmd.busy}>{cmd.busy ? 'Issuing…' : 'Get my command'}</Button>}
            </div>

            <p className="mt-4 text-[12px] text-white/30">
              No Node.js? <code className="font-mono text-white/45">{NODE_INSTALL[os]}</code>
              {cmd.token && <> · <Link href="/settings#worker" className="underline underline-offset-2 hover:text-white/60">Manage tokens</Link></>}
            </p>
            <p className="mt-2 text-[12px] text-white/30">{SWARM_NOTE}</p>
          </>
        )}
      </div>

      {/* the switch, such as it is */}
      <div className="shrink-0 pb-10 text-center">
        <button
          onClick={() => setTab(tab === 'browser' ? 'machine' : 'browser')}
          className="cursor-pointer text-[13.5px] text-white/40 underline-offset-4 transition-colors hover:text-white/75 hover:underline"
        >
          {tab === 'browser'
            ? `Or run it on your own machine for ${NATIVE_RATE} a job`
            : 'Or start one right here in this tab'}
          {tab === 'browser' && online && <span className="ml-2"><Dot on /></span>}
          {tab === 'machine' && running && <span className="ml-2"><Dot on /></span>}
        </button>
      </div>
    </Screen>
  );
}

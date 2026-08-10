'use client';

// Earn. A single centred panel with a segmented control above it: only the way
// you picked is on screen, so the page stays small and each way gets room for
// its full setup. The browser worker runs in the tab, the native worker is one
// command. The swarm needs no control here, since the worker package is what
// will switch when the new network launches.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from './engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from './shared';

const NODE_INSTALL = {
  macos: 'brew install node',
  windows: 'winget install OpenJS.NodeJS',
  linux: 'sudo apt install -y nodejs npm',
} as const;

type Tab = 'browser' | 'machine';

export default function Earn() {
  const engine = useWorkerEngine();
  const { running, blocked } = useEarnControls(engine);
  const cmd = useNativeCommand(engine);
  const os = usePlatform();
  const [tab, setTab] = useState<Tab>('browser');
  const native = engine.nativeStatus;
  const online = native?.online === true;

  if (engine.authLoading) return <Screen><div /></Screen>;

  return (
    <Screen>
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[38rem]">
          <h1 className="pixel-serif text-center text-[30px] leading-tight text-fg md:text-[36px]">
            Put your GPU to work.
          </h1>
          <p className="mt-3 text-center text-[14.5px] text-fg-55">
            Paid in USDC for every job your machine finishes.
          </p>

          {/* the choice */}
          <div className="mx-auto mt-8 flex w-fit rounded-full border border-fg/10 bg-fg/[0.03] p-1">
            {([['browser', 'In this browser'], ['machine', 'On my machine']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`cursor-pointer rounded-full px-5 py-2 text-[13.5px] transition-colors ${
                  tab === key ? 'bg-fg text-on-fg' : 'text-fg-55 hover:text-fg-85'
                }`}
              >
                {label}
                {((key === 'browser' && running) || (key === 'machine' && online)) && <span className="ml-2"><Dot on /></span>}
              </button>
            ))}
          </div>

          <div className="mt-8 rounded-3xl border border-fg/[0.07] bg-fg/[0.02] p-7 md:p-8">
            {tab === 'browser' ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="pixel-serif text-[24px] text-fg">{engine.model.payout.split('/')[0]} <span className="text-[13px] text-fg-45">per job</span></span>
                  {running && <span className="text-[12.5px] text-fg-45"><Dot on={engine.status === 'ready' || engine.status === 'working'} /> {PHASE[engine.status]}</span>}
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-fg-55">{browserNote(engine)}</p>

                {engine.status === 'downloading' && (
                  <div className="mt-5">
                    <div className="h-[2px] w-full overflow-hidden rounded-full bg-fg/10">
                      <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: 'var(--steel)' }} />
                    </div>
                    <div className="mt-2 text-[12px] tabular-nums text-fg-40">{Math.round(engine.loadProgress * 100)}%</div>
                  </div>
                )}

                {(engine.status === 'ready' || engine.status === 'working') && (
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                    <Stat label="Jobs this session" value={String(engine.session.jobsCompleted)} />
                    <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
                    <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
                  </div>
                )}

                {engine.error && <p className="mt-4 text-[13px]" style={{ color: 'var(--danger-soft)' }}>{engine.error}</p>}

                <div className="mt-7">
                  {!engine.isAuthenticated
                    ? <Button onClick={engine.login}>Sign in to start</Button>
                    : running
                      ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                      : <Button onClick={engine.start} disabled={blocked}>Start earning</Button>}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="pixel-serif text-[24px] text-fg">{NATIVE_RATE} <span className="text-[13px] text-fg-45">per job</span></span>
                  {online && <span className="text-[12.5px] text-fg-45"><Dot on /> Connected</span>}
                </div>
                <p className="mt-3 text-[14.5px] leading-relaxed text-fg-55">
                  A 27B model on your own GPU, in the background. Up to 10x a browser worker.
                  Needs Node.js 18 and an NVIDIA, AMD or Apple Silicon GPU.
                </p>

                {online && native && (
                  <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
                    <Stat label="Jobs completed" value={native.jobsCompleted.toLocaleString()} />
                    <Stat label="Tokens" value={native.tokensGenerated.toLocaleString()} />
                    <Stat label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
                  </div>
                )}

                {cmd.failed && <p className="mt-4 text-[13px]" style={{ color: 'var(--danger-soft)' }}>{cmd.failed}</p>}

                <div className="mt-7">
                  {!engine.isAuthenticated
                    ? <Button onClick={engine.login}>Sign in to get a command</Button>
                    : cmd.token
                      ? <CommandBox command={cmd.command} copied={cmd.copied} onCopy={cmd.copy} />
                      : <Button onClick={() => void cmd.issue()} disabled={cmd.busy}>{cmd.busy ? 'Issuing…' : 'Get my command'}</Button>}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-35">
                  <span>No Node.js?</span>
                  <code className="font-mono text-fg-45">{NODE_INSTALL[os]}</code>
                  {cmd.token && <Link href="/settings#worker" className="underline underline-offset-2 hover:text-fg-60">Manage tokens</Link>}
                </div>

                <p className="mt-4 text-[12.5px] text-fg-35">{SWARM_NOTE}</p>
              </>
            )}
          </div>
        </div>
      </div>
    </Screen>
  );
}

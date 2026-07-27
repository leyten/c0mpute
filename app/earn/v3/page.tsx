'use client';

// Version 3 — SPINE. Both ways are always on screen, but only one is open. The
// closed one collapses to a narrow vertical spine on the right with its label
// turned on its side; clicking it slides the pane across. The switch is the
// layout itself moving, so you never lose sight of the other option.
import { useState } from 'react';
import Link from 'next/link';
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, NODE_INSTALL, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand, usePlatform,
} from '../shared';

type Tab = 'browser' | 'machine';

function Spine({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center justify-center gap-4 border-t border-white/[0.07] py-5 transition-colors hover:bg-white/[0.03] md:w-[74px] md:flex-col md:border-l md:border-t-0 md:py-0"
    >
      <Dot on={on} />
      <span
        className="text-[12.5px] uppercase tracking-[0.16em] text-white/40 transition-colors group-hover:text-white/75 md:[writing-mode:vertical-rl]"
      >
        {label}
      </span>
    </button>
  );
}

export default function EarnSpine() {
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
      <div className="flex flex-1 flex-col md:flex-row">
        <div className="flex flex-1 items-center px-8 py-12 md:px-16">
          <div className="w-full max-w-[36rem]">
            {tab === 'browser' ? (
              <>
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">In this browser</span>
                <h1 className="pixel-serif mt-4 text-[32px] leading-tight text-white md:text-[42px]">Start in a tab.</h1>
                <p className="mt-4 max-w-[42ch] text-[14.5px] leading-relaxed text-white/55">{browserNote(engine)}</p>

                <div className="mt-6 flex items-baseline gap-2">
                  <span className="pixel-serif text-[26px] text-white">{engine.model.payout.split('/')[0]}</span>
                  <span className="text-[13px] text-white/45">per job</span>
                  {running && <span className="ml-3 text-[12.5px] text-white/45"><Dot on={live} /> {PHASE[engine.status]}</span>}
                </div>

                {engine.status === 'downloading' && (
                  <div className="mt-6 max-w-[24rem]">
                    <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                      <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: '#80a0c1' }} />
                    </div>
                    <div className="mt-2 text-[12px] tabular-nums text-white/40">{Math.round(engine.loadProgress * 100)}%</div>
                  </div>
                )}

                {live && (
                  <div className="mt-7 flex flex-wrap gap-x-10 gap-y-3">
                    <Stat label="Jobs this session" value={String(engine.session.jobsCompleted)} />
                    <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
                    <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
                  </div>
                )}

                {engine.error && <p className="mt-5 text-[13px]" style={{ color: '#fca5a5' }}>{engine.error}</p>}

                <div className="mt-8">
                  {!engine.isAuthenticated ? <Button onClick={engine.login}>Sign in to start</Button>
                    : running ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                    : <Button onClick={engine.start} disabled={blocked}>Start earning</Button>}
                </div>
              </>
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-[0.14em]" style={{ color: '#80a0c1' }}>On my machine</span>
                <h1 className="pixel-serif mt-4 text-[32px] leading-tight text-white md:text-[42px]">Run a node.</h1>
                <p className="mt-4 max-w-[44ch] text-[14.5px] leading-relaxed text-white/55">
                  A 27B model on your own GPU, in the background. Needs Node.js 18 and an NVIDIA,
                  AMD or Apple Silicon GPU.
                </p>

                <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="pixel-serif text-[26px] text-white">{NATIVE_RATE}</span>
                  <span className="text-[13px] text-white/45">per job, up to 10x a browser worker</span>
                  {online && <span className="ml-3 text-[12.5px] text-white/45"><Dot on /> Connected</span>}
                </div>

                {online && native && (
                  <div className="mt-7 flex flex-wrap gap-x-10 gap-y-3">
                    <Stat label="Jobs completed" value={native.jobsCompleted.toLocaleString()} />
                    <Stat label="Tokens" value={native.tokensGenerated.toLocaleString()} />
                    <Stat label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
                  </div>
                )}

                {cmd.failed && <p className="mt-5 text-[13px]" style={{ color: '#fca5a5' }}>{cmd.failed}</p>}

                <div className="mt-8 max-w-[30rem]">
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

        <Spine
          label={tab === 'browser' ? 'On my machine' : 'In this browser'}
          on={tab === 'browser' ? online : running}
          onClick={() => setTab(tab === 'browser' ? 'machine' : 'browser')}
        />
      </div>
    </Screen>
  );
}

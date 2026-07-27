'use client';

// Variant 1 — SPLIT. The screen is halved floor to ceiling: the tab on the
// left, your machine on the right. No header, no scroll. The page is the
// choice, and each half runs on its own.
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, Eyebrow, NATIVE_RATE, PHASE, Screen, Stat, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand,
} from '../shared';

export default function EarnSplit() {
  const engine = useWorkerEngine();
  const { running, blocked } = useEarnControls(engine);
  const cmd = useNativeCommand(engine);
  const native = engine.nativeStatus;
  const online = native?.online === true;

  if (engine.authLoading) return <Screen><div /></Screen>;

  return (
    <Screen>
      <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
        {/* the tab */}
        <section className="flex flex-col justify-center gap-5 border-b border-white/[0.07] px-8 py-12 md:border-b-0 md:border-r md:px-14">
          <Eyebrow>In this browser</Eyebrow>
          <h1 className="pixel-serif text-[32px] leading-tight text-white md:text-[40px]">Start in a tab.</h1>
          <p className="max-w-[26rem] text-[14.5px] leading-relaxed text-white/55">{browserNote(engine)}</p>

          <div className="flex items-baseline gap-2">
            <span className="pixel-serif text-[26px] text-white">{engine.model.payout.split('/')[0]}</span>
            <span className="text-[13px] text-white/45">per job</span>
          </div>

          {engine.status === 'downloading' && (
            <div className="max-w-[26rem]">
              <div className="h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: '#80a0c1' }} />
              </div>
              <div className="mt-2 text-[12px] tabular-nums text-white/40">{Math.round(engine.loadProgress * 100)}%</div>
            </div>
          )}

          {(engine.status === 'ready' || engine.status === 'working') && (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Jobs this session" value={String(engine.session.jobsCompleted)} />
              <Stat label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
              <Stat label="Earned today" value={engine.todayEarnings === null ? '—' : `$${engine.todayEarnings.toFixed(2)}`} />
            </div>
          )}

          {engine.error && <p className="text-[13px]" style={{ color: '#fca5a5' }}>{engine.error}</p>}

          <div className="flex items-center gap-4">
            {!engine.isAuthenticated
              ? <Button onClick={engine.login}>Sign in to start</Button>
              : running
                ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                : <Button onClick={engine.start} disabled={blocked}>Start earning</Button>}
            {running && <span className="text-[12.5px] text-white/45"><Dot on={engine.status === 'ready' || engine.status === 'working'} /> {PHASE[engine.status]}</span>}
          </div>
        </section>

        {/* your machine */}
        <section className="flex flex-col justify-center gap-5 px-8 py-12 md:px-14">
          <Eyebrow tone="steel">On your machine</Eyebrow>
          <h1 className="pixel-serif text-[32px] leading-tight text-white md:text-[40px]">Run a node.</h1>
          <p className="max-w-[26rem] text-[14.5px] leading-relaxed text-white/55">
            Serves a 27B model on your own GPU in the background. Needs Node.js 18 and an NVIDIA, AMD or Apple Silicon GPU.
          </p>

          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="pixel-serif text-[26px] text-white">{NATIVE_RATE}</span>
            <span className="text-[13px] text-white/45">per job, up to 10x a browser worker</span>
          </div>

          {online && native && (
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat label="Jobs completed" value={native.jobsCompleted.toLocaleString()} />
              <Stat label="Tokens" value={native.tokensGenerated.toLocaleString()} />
              <Stat label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
            </div>
          )}

          {cmd.failed && <p className="text-[13px]" style={{ color: '#fca5a5' }}>{cmd.failed}</p>}

          <div className="max-w-[30rem]">
            {!engine.isAuthenticated
              ? <Button onClick={engine.login}>Sign in to get a command</Button>
              : cmd.token
                ? <CommandBox command={cmd.command} copied={cmd.copied} onCopy={cmd.copy} />
                : <Button onClick={() => void cmd.issue()} disabled={cmd.busy}>{cmd.busy ? 'Issuing…' : 'Get my command'}</Button>}
          </div>

          <p className="text-[12.5px] text-white/35">
            {online ? 'A node of yours is connected.' : SWARM_NOTE}
          </p>
        </section>
      </div>
    </Screen>
  );
}

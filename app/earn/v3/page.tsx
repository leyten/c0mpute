'use client';

// Variant 3 — BANDS. Two full-width rows, one per way of supplying, each one a
// single line of controls and readings. Reads as equipment rather than as a
// pitch: everything is visible at once and nothing is nested.
import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Button, CommandBox, Dot, NATIVE_RATE, PHASE, Screen, SWARM_NOTE,
  browserNote, useEarnControls, useNativeCommand,
} from '../shared';

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[86px]">
      <div className="text-[11px] uppercase tracking-[0.1em] text-white/35">{label}</div>
      <div className="mt-1 text-[17px] tabular-nums text-white">{value}</div>
    </div>
  );
}

export default function EarnBands() {
  const engine = useWorkerEngine();
  const { running, blocked } = useEarnControls(engine);
  const cmd = useNativeCommand(engine);
  const native = engine.nativeStatus;
  const online = native?.online === true;

  if (engine.authLoading) return <Screen><div /></Screen>;

  return (
    <Screen>
      <div className="mx-auto flex w-full max-w-[62rem] flex-1 flex-col justify-center gap-4 px-6 py-10">
        <header>
          <h1 className="pixel-serif text-[28px] leading-tight text-white md:text-[34px]">Supply the network.</h1>
          <p className="mt-2 text-[14px] text-white/50">Two ways to serve. Paid in USDC per job either way.</p>
        </header>

        {/* browser band */}
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-[190px] flex-1">
              <div className="flex items-center gap-2">
                <Dot on={running && (engine.status === 'ready' || engine.status === 'working')} />
                <span className="text-[15px] text-white">Browser worker</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{browserNote(engine)}</p>
            </div>

            <Reading label="Rate" value={engine.model.payout.split('/')[0]} />
            {running
              ? <>
                  <Reading label="Jobs" value={String(engine.session.jobsCompleted)} />
                  <Reading label="Tokens" value={engine.session.tokensGenerated.toLocaleString()} />
                  <Reading label="State" value={PHASE[engine.status] ?? '—'} />
                </>
              : <Reading label="State" value="Not serving" />}

            <div className="ml-auto">
              {!engine.isAuthenticated
                ? <Button onClick={engine.login}>Sign in</Button>
                : running
                  ? <Button kind="quiet" onClick={engine.stop}>Stop</Button>
                  : <Button onClick={engine.start} disabled={blocked}>Start</Button>}
            </div>
          </div>

          {engine.status === 'downloading' && (
            <div className="mt-5 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full transition-[width] duration-300" style={{ width: `${Math.round(engine.loadProgress * 100)}%`, background: '#80a0c1' }} />
            </div>
          )}
          {engine.error && <p className="mt-4 text-[13px]" style={{ color: '#fca5a5' }}>{engine.error}</p>}
        </section>

        {/* native band */}
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-[190px] flex-1">
              <div className="flex items-center gap-2">
                <Dot on={online} />
                <span className="text-[15px] text-white">Native worker</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
                A 27B model on your GPU, in the background. Node.js 18 and an NVIDIA, AMD or Apple Silicon GPU.
              </p>
            </div>

            <Reading label="Rate" value={NATIVE_RATE} />
            {online && native
              ? <>
                  <Reading label="Jobs" value={native.jobsCompleted.toLocaleString()} />
                  <Reading label="Tokens" value={native.tokensGenerated.toLocaleString()} />
                  <Reading label="Speed" value={`${native.tokPerSec.toFixed(1)} tok/s`} />
                </>
              : <Reading label="State" value="Not connected" />}

            <div className="ml-auto">
              {!engine.isAuthenticated
                ? <Button onClick={engine.login}>Sign in</Button>
                : !cmd.token
                  ? <Button onClick={() => void cmd.issue()} disabled={cmd.busy}>{cmd.busy ? 'Issuing…' : 'Get command'}</Button>
                  : null}
            </div>
          </div>

          {cmd.token && <div className="mt-5"><CommandBox command={cmd.command} copied={cmd.copied} onCopy={cmd.copy} /></div>}
          {cmd.failed && <p className="mt-4 text-[13px]" style={{ color: '#fca5a5' }}>{cmd.failed}</p>}
        </section>

        <p className="text-[12.5px] text-white/35">
          {SWARM_NOTE}
          {engine.lifetimeEarned > 0 && <> Earned on this account to date <span className="tabular-nums text-white/55">${engine.lifetimeEarned.toFixed(2)}</span>.</>}
        </p>
      </div>
    </Screen>
  );
}

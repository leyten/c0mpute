'use client';

// /earn/v1 — the empty page.
//
// The chat's empty state applied to earning. One serif line that changes as the
// state changes, one dim line under it, one control, and one quiet line of
// truth. Before the worker starts that quiet line describes this machine; once
// it is serving it carries the live reading. Nothing else is on the page: no
// panels, no tiles, no plot.
//
// Every value comes from useWorkerEngine and nothing here is derived, so the
// page can never disagree with the worker. At most three numbers are on screen
// at once, which is what the quiet line is budgeted for.

import './v1.css';

import { useWorkerEngine } from '../engine/useWorkerEngine';

const num = (n: number) => n.toLocaleString('en-US');
const usd = (n: number) => `$${n.toFixed(2)}`;

interface View {
  headline: string;
  sub: string;
  /** The single quiet line. Empty means the line is not on the page at all. */
  quiet: string;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}

export default function EarnEmpty() {
  const engine = useWorkerEngine();
  const {
    authLoading, isAuthenticated, login,
    connected, device, model, modelFits,
    status, error, loadProgress, workerId,
    session, todayEarnings,
  } = engine;

  // A worker that is serving always holds an id from the orchestrator. Ready
  // without one means the runtime unloaded underneath the status, and idle is
  // the honest reading.
  const stale = (status === 'ready' || status === 'working') && !workerId;
  const settled = status === 'offline' || stale;

  const phase =
    device.webGPUSupported === false && settled ? 'nogpu'
      : !isAuthenticated ? 'signedout'
        : settled ? 'idle'
          : status;

  // What this machine is, in one line, before it has served anything.
  const machine =
    device.webGPUSupported === null ? 'Checking this machine.'
      : device.webGPUSupported === false ? 'This browser has no WebGPU.'
        : !connected ? 'Connecting to the network.'
          : [
            device.gpuInfo ?? 'GPU detected',
            device.detectedVRAM !== null ? `${device.detectedVRAM} GB` : null,
            modelFits ? `${model.size} download, once` : `under the ${model.vram} this model asks for`,
          ].filter(Boolean).join(' · ');

  // The live reading, in the same line. Three numbers is the whole budget:
  // jobs and tokens for this session, and what the account has earned today.
  const bits: string[] = [];
  if (session.jobsCompleted > 0) bits.push(`${num(session.jobsCompleted)} jobs this session`);
  if (session.tokensGenerated > 0) bits.push(`${num(session.tokensGenerated)} tokens`);
  if (bits.length === 0) bits.push('Waiting for the first job');
  if (todayEarnings !== null && (todayEarnings > 0 || session.jobsCompleted > 0)) {
    bits.push(`${usd(todayEarnings)} earned today`);
  }
  const live = bits.join(' · ');

  const view: View =
    phase === 'nogpu'
      ? {
        headline: 'This browser cannot serve.',
        sub: 'The worker needs WebGPU to hold a model in graphics memory. Chrome or Edge on a desktop machine with a GPU can run it.',
        quiet: machine,
        label: 'Start earning',
        disabled: true,
      }
      : phase === 'signedout'
        ? {
          headline: 'Earn while your GPU idles.',
          sub: 'The browser worker is live today. Sign in to serve requests from this tab and get paid in USDC for every job it finishes.',
          quiet: machine,
          label: 'Sign in',
          onClick: login,
        }
        : phase === 'idle'
          ? {
            headline: 'Earn while your GPU idles.',
            sub: 'The browser worker is live today. Start it and this tab serves requests for the network, paid in USDC for every job it finishes.',
            quiet: machine,
            label: 'Start earning',
            onClick: engine.start,
            disabled: !connected,
          }
          : phase === 'initializing'
            ? {
              headline: 'Starting the runtime.',
              sub: 'Bringing up WebGPU and the model runtime in this tab.',
              quiet: '',
              label: 'Starting',
              disabled: true,
            }
            : phase === 'downloading'
              ? {
                headline: 'Fetching the model.',
                sub: `The model is ${model.size}, fetched once and cached by the browser. Keep this tab open while it lands.`,
                quiet: `${Math.round(loadProgress * 100)}% downloaded`,
                label: 'Fetching',
                disabled: true,
              }
              : phase === 'connecting'
                ? {
                  headline: 'Measuring this machine.',
                  sub: 'Running a short generation to measure the speed of this machine, then registering that reading with the network.',
                  quiet: '',
                  label: 'Registering',
                  disabled: true,
                }
                : phase === 'ready'
                  ? {
                    headline: 'Ready for work.',
                    sub: 'Registered with the network. Jobs arrive on their own, and this tab can sit in the background while they do.',
                    quiet: live,
                    label: 'Stop',
                    onClick: engine.stop,
                  }
                  : phase === 'working'
                    ? {
                      headline: 'Serving a job.',
                      sub: 'Generating an answer for a live request on this machine.',
                      quiet: live,
                      label: 'Stop',
                      onClick: engine.stop,
                    }
                    : {
                      headline: 'The worker stopped.',
                      sub: error ?? 'The runtime reported a fault and unloaded the model.',
                      quiet: '',
                      label: 'Try again',
                      onClick: engine.reset,
                    };

  // The fade belongs to the move between stages, not to every job: ready and
  // working alternate all session, and a page that fades on each one flickers.
  const stage =
    phase === 'ready' || phase === 'working' ? 'serving'
      : phase === 'initializing' || phase === 'downloading' || phase === 'connecting' ? 'preparing'
        : phase;

  if (authLoading) return <div className="ev1 min-h-dvh" />;

  return (
    <div className="ev1 grid min-h-dvh place-items-center px-4">
      <div key={stage} className="ev1-fade w-full max-w-[46rem]">
        <h1
          className="pixel-serif text-[34px] leading-[1.15] tracking-[-0.01em] md:text-[42px]"
          style={{ color: 'var(--cu-text)' }}
        >
          {view.headline}
        </h1>

        <p className="mt-3 text-[15px] leading-[1.6]" style={{ color: 'var(--cu-dim)' }}>
          {view.sub}
        </p>

        <div className="mt-8">
          <button className="ev1-btn" onClick={view.onClick} disabled={view.disabled}>
            {view.label}
          </button>
        </div>

        {view.quiet && (
          <p className="mt-4 text-[13px]" style={{ color: 'var(--cu-faint)' }}>
            {view.quiet}
          </p>
        )}
      </div>
    </div>
  );
}

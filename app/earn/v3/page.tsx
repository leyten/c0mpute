'use client';

// Earn, variant 3: "the door".
//
// The homepage's door card, opened. One card on an empty field carries the
// whole page — a label, one serif line, one line under it, one control — and
// the live state is written into those same slots as the worker starts, the
// model downloads and the machine serves. Nothing exists outside the card, and
// running adds only a hairline of progress or a single line of figures to it.
//
// Every value comes from useWorkerEngine. Fields the engine does not return are
// absent from the page rather than filled in.
import './ui.css';

import { useWorkerEngine } from '../engine/useWorkerEngine';

type Stage =
  | 'checking'  // auth is still resolving
  | 'blocked'   // this browser cannot run a worker
  | 'unfit'     // the GPU is under the model's minimum
  | 'guest'     // signed out
  | 'idle'      // signed in, worker off
  | 'joining'   // starting up, downloading, registering
  | 'serving'   // registered and taking jobs
  | 'problem';  // the worker stopped on an error

const usd = (n: number) => `$${n.toFixed(2)}`;
const int = (n: number) => n.toLocaleString('en-US');

export default function EarnDoorPage() {
  const {
    authLoading, isAuthenticated, login,
    connected, nativeStatus, device, model, modelFits,
    status, error, loadProgress,
    session, lifetimeEarned,
    start, stop, reset,
  } = useWorkerEngine();

  const preparing = status === 'initializing' || status === 'downloading' || status === 'connecting';
  const serving = status === 'ready' || status === 'working';
  // A native worker under the same account holds the place whether or not this
  // tab is doing anything.
  const nativeOnline = isAuthenticated && !!nativeStatus?.online;

  // What the tab is doing outranks who is signed in: a worker that is already
  // downloading or serving is the state worth reading.
  const stage: Stage =
    status === 'error' ? 'problem'
    : preparing ? 'joining'
    : serving ? 'serving'
    : authLoading ? 'checking'
    : device.webGPUSupported === false ? 'blocked'
    : !modelFits ? 'unfit'
    : !isAuthenticated ? 'guest'
    : 'idle';

  const tone =
    stage === 'serving' || nativeOnline ? 'var(--d3-live)'
    : stage === 'joining' ? 'var(--d3-steel)'
    : stage === 'problem' || stage === 'blocked' || stage === 'unfit' ? 'var(--d3-warn)'
    : 'var(--d3-faint)';

  const line =
    stage === 'problem' ? 'The worker stopped.'
    : stage === 'joining' ? 'Bringing this machine online.'
    : stage === 'serving' ? 'This machine is serving.'
    : stage === 'blocked' ? 'This browser cannot serve.'
    : stage === 'unfit' ? 'This GPU is under the minimum.'
    : nativeOnline ? 'A worker is already serving.'
    : 'Put this machine to work.';

  // The offer, and the answer to whether this machine can take it. The reading
  // is an estimate from WebGPU limits, not a figure the device reports, so it
  // is never quoted as one.
  const pitch = `The browser worker is live today: your GPU answers real requests from the c0mpute network and earns ${model.payout}.`;

  const under =
    stage === 'problem' ? (error ?? 'The worker stopped before it registered. Starting again is safe.')
    : stage === 'joining' ? (
        status === 'connecting' ? 'The model is loaded and this machine is registering with the network.'
        : status === 'downloading' ? 'The model is downloading to this tab. Keep the tab open; it is cached for next time.'
        : 'The worker is starting up on this machine.')
    : stage === 'serving' ? 'It answers whatever the network sends for as long as this tab stays open.'
    : stage === 'blocked' ? 'A worker in the browser needs WebGPU. Chrome or Edge on a machine with its own GPU can take jobs.'
    : stage === 'unfit' ? `This browser estimates ${device.detectedVRAM} GB of video memory here, and ${model.name} needs ${model.vram} to run.`
    : nativeOnline ? 'A native worker is connected under your account and taking jobs in the background.'
    : stage === 'guest' ? `${pitch} Sign in, and this machine starts serving once the ${model.size} model has downloaded.`
    : stage === 'checking' ? `${pitch} The one-time download is ${model.size}.`
    : `${pitch} The one-time download is ${model.size}, and this browser estimates enough video memory to run it.`;

  const pct = Math.round(Math.max(0, Math.min(1, loadProgress)) * 100);

  // Session work is read off the native worker whenever one is connected,
  // because that is the machine doing the work for this account. Earnings are
  // the account's own total, and they are earned rather than paid out.
  const served = nativeOnline ? nativeStatus!.jobsCompleted : session.jobsCompleted;
  const showFigures = isAuthenticated && (stage === 'serving' || nativeOnline);

  return (
    <div className="d3">
      <div className="d3-card" data-testid="v3-card" data-stage={stage}>
        <div key={stage} className="d3-fade">
          <div className="d3-eyebrow">
            <span className={`d3-dot ${status === 'working' ? 'd3-pulse' : ''}`} style={{ color: tone }} />
            Browser worker
          </div>

          <h1 className="pixel-serif d3-line">{line}</h1>

          <p className="d3-under" data-testid="v3-under">{under}</p>

          {stage === 'joining' && (
            <div className="d3-progress" data-testid="v3-progress">
              <div className="d3-bar"><span style={{ width: `${pct}%` }} /></div>
              <div className="d3-pct">{pct}%</div>
            </div>
          )}

          {showFigures && (
            <p className="d3-figures" data-testid="v3-figures">
              <b>{int(served)}</b> {served === 1 ? 'job' : 'jobs'} served{' '}
              {nativeOnline && stage !== 'serving' ? 'by that worker' : 'in this session'},{' '}
              <b>{usd(lifetimeEarned)}</b> earned on this account.
            </p>
          )}

          {stage === 'checking' ? (
            <button className="d3-btn" disabled>Checking your account</button>
          ) : stage === 'guest' ? (
            <button className="d3-btn" onClick={() => login()}>Sign in with X</button>
          ) : stage === 'problem' ? (
            <button className="d3-btn d3-btn--quiet" onClick={reset} data-testid="v3-retry">Try again</button>
          ) : stage === 'joining' || stage === 'serving' ? (
            <button className="d3-btn d3-btn--quiet" onClick={stop} data-testid="v3-stop">Stop the worker</button>
          ) : stage === 'idle' ? (
            <button className="d3-btn" onClick={start} disabled={!connected} data-testid="v3-start">
              {connected ? 'Start the worker' : 'Waiting for the network'}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

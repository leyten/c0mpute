'use client';

// /earn/v2 — "the figure".
//
// The premise: the money is the page. What this machine has earned, set as one
// enormous serif number, with a label above it and a single line under it. The
// machine itself, the model, the speed, the per-job list: those are particulars,
// and they stay off screen until the reader asks for them.
//
// Before the reader starts there are four things on the page and nothing else.
// While it runs, the line under the figure carries the whole state of the
// worker: loading, registering, ready, serving, stopped. All of it comes from
// useWorkerEngine; nothing here touches the socket, WebLLM or an API.

import { useWorkerEngine } from '../engine/useWorkerEngine';
import './figure.css';

const money = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FigurePage() {
  const engine = useWorkerEngine();
  const {
    authLoading, isAuthenticated, login,
    connected, nativeStatus, device, model,
    status, error, loadProgress,
    sessionJobs, lifetimeEarned,
    start, stop, reset,
  } = engine;

  // Nothing is true yet, so nothing is claimed.
  if (authLoading) return <div className="fg" />;

  const nativeOnline = !!nativeStatus?.online;
  const preparing = status === 'initializing' || status === 'downloading' || status === 'connecting';
  const registered = nativeOnline || status === 'ready' || status === 'working';
  const webGPUMissing = device.webGPUSupported === false;
  const pct = Math.round(loadProgress * 100);

  /* --------------------------------------------------- the one line under it */
  // At rest it says where the figure came from and what starting costs. Once
  // the machine is doing something, it says what.
  let line: string;
  if (status === 'error') {
    line = error ?? 'This machine stopped before it could register.';
  } else if (nativeOnline) {
    line = 'A native worker is serving on this account, so browser serving is paused.';
  } else if (status === 'initializing') {
    line = 'Starting the model.';
  } else if (status === 'downloading') {
    line = `Downloading the model, ${pct}%.`;
  } else if (status === 'connecting') {
    line = 'Registering with the network.';
  } else if (status === 'working') {
    line = 'Serving a job right now.';
  } else if (status === 'ready') {
    line = 'Ready, waiting for the next job.';
  } else if (webGPUMissing) {
    line = 'Earned for completed jobs, in USDC. This browser has no WebGPU, so it cannot run the model. Chrome or Edge on this machine can.';
  } else if (!connected) {
    line = 'Earned for completed jobs, in USDC. Waiting for the network before this machine can register.';
  } else {
    line = `Earned for completed jobs, in USDC. ${device.gpuInfo ? `Your ${device.gpuInfo}` : 'This machine'} can run the model; it downloads once at ${model.size}, then jobs arrive on their own.`;
  }

  /* ------------------------------------------------------------ the control */
  let control: { label: string; onClick?: () => void; disabled?: boolean; quiet?: boolean };
  if (!isAuthenticated) {
    control = { label: 'Sign in with X', onClick: () => login() };
  } else if (nativeOnline) {
    control = { label: 'Native worker serving', disabled: true };
  } else if (status === 'error') {
    control = { label: 'Try again', onClick: reset, quiet: true };
  } else if (registered || preparing) {
    control = { label: 'Stop earning', onClick: stop, quiet: true };
  } else {
    control = { label: 'Start earning', onClick: start, disabled: webGPUMissing || !connected };
  }

  return (
    <div className="fg">
      <main className="fg-fade fg-column mx-auto w-full max-w-[46rem] px-6">
        {isAuthenticated ? (
          <>
            <div className="fg-eyebrow">Total earned</div>
            <div className="pixel-serif fg-figure" data-testid="fg-figure">{money(lifetimeEarned)}</div>
          </>
        ) : (
          <h1 className="pixel-serif fg-display">Earn from the GPU you already own.</h1>
        )}

        <p className={`fg-line${status === 'error' ? ' fg-line-bad' : ''}`} data-testid="fg-line">
          {(registered || preparing) && (
            <span className={`fg-dot${registered ? ' fg-dot-live' : ''}`} aria-hidden />
          )}
          {isAuthenticated
            ? line
            : 'This works today. Your browser answers questions for the c0mpute network, and every job it completes earns USDC.'}
        </p>

        {preparing && (
          <div className="fg-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="fg-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* the only per-job detail on the page, and it is closed */}
        {isAuthenticated && sessionJobs.length > 0 && (
          <details className="fg-details">
            <summary>
              {sessionJobs.length} {sessionJobs.length === 1 ? 'job' : 'jobs'} this session
            </summary>
            <ul className="fg-jobs">
              {sessionJobs.map(job => (
                <li key={job.id}>
                  <span>{job.status === 'failed' ? 'Failed' : `${job.tokens.toLocaleString('en-US')} tokens`}</span>
                  <span>{(job.ms / 1000).toFixed(1)}s</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        <div>
          <button
            type="button"
            className={`fg-btn${control.quiet ? ' fg-btn-quiet' : ''}`}
            onClick={control.onClick}
            disabled={control.disabled}
            data-testid="fg-action"
          >
            {control.label}
          </button>
        </div>
      </main>
    </div>
  );
}

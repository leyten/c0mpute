'use client';

// /earn/v2 — "the statement".
//
// The premise: this page is an earnings statement, not an instrument panel.
// Money leads, the machine is the particulars at the bottom. One sheet, hairline
// rules instead of cards, and no figure on it that the engine did not supply.
// All state comes from useWorkerEngine; nothing here touches the socket, WebLLM
// or an API directly.

import Link from 'next/link';

import { useWorkerEngine } from '../engine/useWorkerEngine';
import './statement.css';
import { Figure, Label, Ledger, Money, Notice, ParticularRow, Rule, StatusMark, type Tone } from './sheet';

const DASH = '–';

const fmtDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function StatementPage() {
  const engine = useWorkerEngine();
  const {
    authLoading, isAuthenticated, login,
    connected, networkStats, nativeStatus,
    device, model, modelFits,
    status, error, loadProgress, loadingText, workerId, currentJobId, benchmarkTokPerSec,
    sessionJobs, uptimeSeconds, lifetime, todayEarnings, lifetimeEarned,
    start, stop, reset,
  } = engine;

  // The server and the reader can sit in different timezones, so the issue date
  // is allowed to differ between the two renders rather than throwing hydration.
  const issuedOn = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  // A job in flight gets a pending line. It carries no time or token reading:
  // those are settlement facts and the engine only reports them once the job
  // completes, so the statement leaves them blank rather than guessing.
  const activeJobId = currentJobId ?? nativeStatus?.currentJob ?? null;

  const nativeOnline = !!nativeStatus?.online;
  const preparing = status === 'initializing' || status === 'downloading' || status === 'connecting';
  const serving = status === 'working' || (nativeOnline && !!nativeStatus?.currentJob);
  const registered = nativeOnline || status === 'ready' || status === 'working';
  const webGPUMissing = device.webGPUSupported === false;

  const statusLabel = nativeOnline
    ? (nativeStatus?.currentJob ? 'Serving' : 'Ready')
    : status === 'offline' ? 'Not serving'
    : status === 'initializing' ? 'Starting'
    : status === 'downloading' ? 'Downloading model'
    : status === 'connecting' ? 'Registering'
    : status === 'ready' ? 'Ready'
    : status === 'working' ? 'Serving'
    : 'Stopped';

  const tone: Tone = registered ? 'live' : preparing ? 'prep' : status === 'error' ? 'bad' : 'idle';

  // The ledger caption describes the rows actually listed. The engine clears
  // session counters on stop but keeps the job list, so reading the caption off
  // `session` would leave it claiming zero above a table full of entries.
  const listedTokens = sessionJobs.reduce((sum, j) => sum + j.tokens, 0);

  const emptyLedgerText = !isAuthenticated
    ? 'Line items appear here once you sign in and this machine starts serving.'
    : status === 'offline'
      ? 'Start this machine to take jobs. Each one is entered here as it settles.'
      : preparing
        ? 'The model is loading. Entries begin once this machine registers with the network.'
        : registered
          ? 'This machine is registered and waiting for its first job of the session.'
          : 'Entries appear here as jobs settle.';

  /* ----------------------------------------------------------- the control */

  let button: { label: string; onClick?: () => void; quiet?: boolean; disabled?: boolean };
  let hint: string;

  if (!isAuthenticated) {
    button = { label: 'Sign in with X', onClick: () => login() };
    hint = 'Payouts settle to your account. A Solana wallet can be connected later in Settings.';
  } else if (nativeOnline) {
    button = { label: 'Native worker serving', disabled: true };
    hint = 'Browser serving is paused while the native worker runs.';
  } else if (status === 'error') {
    button = { label: 'Reset', onClick: reset, quiet: true };
    hint = 'Resetting returns this machine to idle so it can start again.';
  } else if (status === 'offline') {
    button = { label: 'Start this machine', onClick: start, disabled: webGPUMissing || !connected };
    hint = webGPUMissing
      ? 'WebGPU is required. Chrome or Edge can run the browser worker.'
      : !connected
        ? 'Waiting for the network before this machine can register.'
        : `One-time download of ${model.size}. Browser jobs pay ${model.payout}.`;
  } else if (registered) {
    button = { label: 'Stop this machine', onClick: stop, quiet: true };
    hint = 'Stopping unloads the model and frees the GPU.';
  } else {
    button = { label: statusLabel, disabled: true };
    hint = 'Keep this tab open while the model loads.';
  }

  /* --------------------------------------------------------------- markup */

  return (
    <div className="st2">
      <div className="st2-sheet">

        {/* letterhead */}
        <header className="st2-head">
          <div>
            <Link className="st2-mark" href="/">c0mpute</Link>
            <div className="st2-kicker">Statement of earnings</div>
          </div>
          <div className="st2-head-right">
            <div className="st2-date" suppressHydrationWarning>Issued {issuedOn}</div>
            <StatusMark tone={tone} label={statusLabel} pulse={serving || preparing} />
          </div>
        </header>

        <Rule strong />

        {/* the amount */}
        <section className="st2-block">
          <div className="st2-amount-row">
            <div className="st2-lead-box" data-testid="st2-lead-box">
              {authLoading ? (
                <>
                  <Label>Earned to date</Label>
                  <div className="st2-lead st2-lead-empty">{DASH}</div>
                  <p className="st2-lead-note">Opening your account.</p>
                </>
              ) : !isAuthenticated ? (
                <>
                  <Label>Statement</Label>
                  <h1 className="st2-lead st2-lead-text">Sign in to open your statement.</h1>
                  <p className="st2-lead-note">
                    Your account records every job this machine serves and the amount owed for it, paid in USDC.
                  </p>
                </>
              ) : (
                <>
                  <Label>Earned to date</Label>
                  <div className="st2-lead" data-testid="st2-lead">
                    <Money amount={lifetimeEarned} />
                  </div>
                  <p className="st2-lead-note">
                    Paid in USDC. Each job this machine completes settles to the account at the rate below.
                  </p>
                </>
              )}
            </div>

            <div className="st2-action">
              <button
                type="button"
                className={`st2-btn${button.quiet ? ' st2-btn-quiet' : ''}`}
                onClick={button.onClick}
                disabled={button.disabled}
                data-testid="st2-action"
              >
                {button.label}
              </button>
              <p className="st2-hint">{hint}</p>
            </div>
          </div>

          {isAuthenticated && !authLoading && (
            <div className="st2-figures">
              <Figure
                label="Today"
                value={todayEarnings !== null ? `$${todayEarnings.toFixed(2)}` : DASH}
                muted={todayEarnings === null}
              />
              <Figure
                label="Jobs paid"
                value={lifetime ? lifetime.paidJobs.toLocaleString('en-US') : DASH}
                muted={!lifetime}
              />
              <Figure
                label="Tokens generated"
                value={lifetime ? lifetime.totalTokens.toLocaleString('en-US') : DASH}
                muted={!lifetime}
              />
              <Figure label="Rate" value={model.payout} />
            </div>
          )}
        </section>

        {/* in-flight conditions: loading, failure, capacity */}
        {(preparing || status === 'error' || (webGPUMissing && !nativeOnline)) && (
          <>
            <Rule />
            <section className="st2-block-tight">
              {preparing && (
                <>
                  <div className="st2-progress-head">
                    <span className="st2-progress-text">{loadingText || 'Preparing this machine.'}</span>
                    <span className="st2-progress-pct">{Math.round(loadProgress * 100)}%</span>
                  </div>
                  <div className="st2-track">
                    <div className="st2-fill" style={{ width: `${Math.round(loadProgress * 100)}%` }} />
                  </div>
                </>
              )}
              {status === 'error' && (
                <Notice title="This machine stopped" tone="bad" action={{ label: 'Reset and try again', onClick: reset }}>
                  {error ?? 'The worker stopped before it could register.'}
                </Notice>
              )}
              {webGPUMissing && !nativeOnline && status !== 'error' && (
                <Notice title="Browser cannot serve" tone="warn">
                  This browser does not support WebGPU, so it cannot run the model. Chrome or Edge can run the browser
                  worker on this machine.
                </Notice>
              )}
            </section>
          </>
        )}

        <Rule />

        {/* the line items */}
        <section className="st2-block">
          <div className="st2-section-head">
            <h2 className="st2-section-title">Line items</h2>
            <div className="st2-section-note" data-testid="st2-session-note">
              {sessionJobs.length === 0
                ? 'This session'
                : `This session · ${sessionJobs.length} ${sessionJobs.length === 1 ? 'entry' : 'entries'} · ${listedTokens.toLocaleString('en-US')} tokens`}
            </div>
          </div>
          <Ledger jobs={sessionJobs} pendingId={activeJobId} emptyText={emptyLedgerText} />
        </section>

        <Rule />

        {/* the machine, demoted to particulars */}
        <section className="st2-block">
          <div className="st2-section-head">
            <h2 className="st2-section-title">Particulars</h2>
            <div className="st2-section-note">The machine behind the figures above</div>
          </div>

          <div className="st2-particulars">
            <ParticularRow
              label="Machine"
              value={nativeOnline ? 'Native worker' : device.gpuInfo ?? 'Not detected'}
            />
            <ParticularRow label="Model" value={model.name} />
            <ParticularRow
              label="Memory"
              value={device.detectedVRAM !== null ? `${device.detectedVRAM} GB estimated` : 'Unknown'}
            />
            <ParticularRow label="Download" value={model.size} />
            <ParticularRow
              label="Acceleration"
              value={
                device.webGPUSupported === null ? 'Checking' : device.webGPUSupported ? 'WebGPU available' : 'WebGPU unavailable'
              }
            />
            <ParticularRow
              label="Measured speed"
              value={
                nativeOnline && nativeStatus
                  ? `${nativeStatus.tokPerSec.toFixed(1)} tokens per second`
                  : benchmarkTokPerSec > 0
                    ? `${benchmarkTokPerSec.toFixed(1)} tokens per second`
                    : 'Not measured yet'
              }
            />
            <ParticularRow
              label="Worker reference"
              value={(nativeOnline ? nativeStatus?.workerId : workerId)?.slice(0, 14) ?? 'Not registered'}
              mono
            />
            <ParticularRow label="Time served" value={fmtDuration(uptimeSeconds)} mono />
          </div>

          {!modelFits && (
            <p className="st2-foot-note">
              Detected memory is below the {model.vram} this model asks for. The download can still be attempted, and the
              statement will show whatever this machine manages to serve.
            </p>
          )}
        </section>

        <Rule />

        {/* what the account is part of */}
        <section className="st2-block">
          <div className="st2-closing">
            {connected && networkStats && (
              <p>
                <span className="st2-closing-stat">{networkStats.workersOnline.toLocaleString('en-US')}</span> machines
                are serving c0mpute right now, with{' '}
                <span className="st2-closing-stat">{networkStats.jobsInQueue.toLocaleString('en-US')}</span> jobs in the
                queue.
              </p>
            )}
            <p>
              The browser worker is live today. The model runs on your own GPU, jobs arrive from the network
              automatically, and every completed job is paid in USDC.
            </p>
            <p>
              betanet, the wider c0mpute network, is launching. Every figure on this statement comes from work already
              served.
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}

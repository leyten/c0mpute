'use client';

// /earn/v1 — the instrument.
//
// One machine, read out precisely: what it is, what it is doing this second,
// what it has earned, and where it sits in the network. The channel set never
// reorders. Four fixed channels hold the four quantities of the work; a
// quantity that is not being produced reads as a dash rather than vacating its
// slot, and the recessed display below them switches channel between the model
// fetch and the throughput trace, the way an instrument selects a reading.
//
// Every value on this page comes from useWorkerEngine. The only derived figure
// is the throughput trace, which differences the engine's own token counter on
// a 1 Hz clock (./trace.ts).
//
// One rule holds the readings honest: the face reads THIS browser worker, and
// a native worker's numbers only ever appear while this tab is doing nothing.
// Mixing the two would put one machine's rate under another machine's headline.

import './v1.css';

import { useWorkerEngine } from '../engine/useWorkerEngine';
import { useTokenTrace } from './trace';
import { Channel, DASH, FetchMeter, KV, Ledger, PeerArray, Pill, Plot, type Tone } from './parts';

const fmtClockSpan = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const usd = (n: number) => `$${n.toFixed(2)}`;
const num = (n: number) => n.toLocaleString('en-US');

interface FaceCopy {
  tone: Tone;
  pill: string;
  pulse: boolean;
  headline: string;
  sub: string;
}

export default function EarnInstrument() {
  const engine = useWorkerEngine();
  const {
    authLoading, isAuthenticated, login,
    connected, networkStats, nativeStatus,
    device, model, modelFits,
    status, error, loadProgress, loadingText, workerId, currentJobId, benchmarkTokPerSec,
    session, sessionJobs, uptimeSeconds, lifetime, todayEarnings, lifetimeEarned,
  } = engine;

  // A worker that is serving always has an id from the orchestrator. If the
  // status says ready while the id is gone, the engine unloaded underneath it
  // (stopping mid-job races the generation loop's own reset), and the honest
  // reading is idle rather than "registered".
  const stale = (status === 'ready' || status === 'working') && !workerId;
  const armed = (status === 'ready' || status === 'working') && !stale;
  const preparing = status === 'initializing' || status === 'downloading' || status === 'connecting';
  const nativeOnline = !!nativeStatus?.online;
  /** The native worker only speaks for this page while the browser worker is idle. */
  const nativeReading = nativeOnline && (status === 'offline' || stale);
  /** Image workers report 0 tok/s by design: they render, they do not generate. */
  const nativeImage = nativeStatus?.type === 'image';

  const trace = useTokenTrace(session.tokensGenerated, armed);

  const phase: 'auth' | 'signedout' | 'nogpu' | typeof status =
    authLoading ? 'auth'
      : !isAuthenticated ? 'signedout'
        : stale ? 'offline'
          : device.webGPUSupported === false && status === 'offline' ? 'nogpu'
            : status;

  // ------------------------------------------------------------------ face
  let face: FaceCopy =
    phase === 'auth'
      ? {
        tone: 'idle', pill: 'checking', pulse: false,
        headline: 'Reading your session',
        sub: 'Checking which account this browser is signed in with.',
      }
      : phase === 'signedout'
        ? {
          tone: 'steel', pill: 'unbound', pulse: false,
          headline: 'Bind this machine',
          sub: 'The browser worker is live today. Sign in to register this machine with the orchestrator, which then assigns it jobs automatically and pays in USDC for the ones it completes.',
        }
        : phase === 'nogpu'
          ? {
            tone: 'fault', pill: 'unsupported', pulse: false,
            headline: 'WebGPU unavailable',
            sub: 'This browser cannot reach the GPU, so it cannot hold the model. Chrome or Edge on a desktop machine can run the browser worker.',
          }
          : phase === 'offline'
            ? {
              tone: 'idle', pill: 'idle', pulse: false,
              headline: 'Machine idle',
              sub: `Nothing is loaded yet. The first start downloads ${model.size}, holds the model in GPU memory, and serves jobs for as long as this tab stays open.`,
            }
            : phase === 'initializing'
              ? {
                tone: 'steel', pill: 'init', pulse: true,
                headline: 'Starting the runtime',
                sub: 'Bringing up WebGPU and the model runtime on this machine.',
              }
              : phase === 'downloading'
                ? {
                  tone: 'steel', pill: 'fetch', pulse: true,
                  headline: 'Fetching model weights',
                  sub: `Downloading ${model.size} once. The browser caches the weights, so later starts skip this step.`,
                }
                : phase === 'connecting'
                  ? {
                    tone: 'steel', pill: 'register', pulse: true,
                    headline: 'Measuring and registering',
                    sub: 'Running a short generation to measure this machine, then registering that reading with the orchestrator.',
                  }
                  : phase === 'ready'
                    ? {
                      tone: 'live', pill: 'ready', pulse: false,
                      headline: 'Ready for assignment',
                      sub: 'Registered and idle. The orchestrator assigns work automatically, and the trace holds at zero until a job arrives.',
                    }
                    : phase === 'working'
                      ? {
                        tone: 'live', pill: 'serving', pulse: true,
                        headline: 'Serving a job',
                        sub: 'Generating tokens for a live request. The trace is this machine\'s output rate, sampled once a second.',
                      }
                      : {
                        tone: 'fault', pill: 'fault', pulse: false,
                        headline: 'The worker stopped',
                        sub: 'The runtime reported the fault below. Reset returns the machine to idle so it can be started again.',
                      };

  if (nativeReading) {
    face = {
      tone: 'live', pill: 'native', pulse: !!nativeStatus?.currentJob,
      headline: nativeImage ? 'Native image worker connected' : 'Native worker connected',
      sub: nativeImage
        ? 'A native worker is rendering images on this account. Browser serving is held while it runs, and its readings are below.'
        : 'A native worker is serving on this account. Browser serving is held while it runs, and its readings are below.',
    };
  }

  // -------------------------------------------------------------- readings
  const reading = armed || nativeReading;
  /** An image worker produces no tokens, so the token channels stay blank. */
  const tokenReading = reading && !(nativeReading && nativeImage);
  const rateRead = nativeReading ? nativeStatus!.tokPerSec : trace.rate;
  const tokensRead = nativeReading ? nativeStatus!.tokensGenerated : session.tokensGenerated;
  const jobsRead = nativeReading ? nativeStatus!.jobsCompleted : session.jobsCompleted;
  const shownWorkerId = nativeReading ? nativeStatus?.workerId ?? null : workerId;
  // The orchestrator sends a busy sentinel for native workers, not a job id, so
  // it is reported as a state rather than sliced into something that looks
  // like a hash.
  const shownJobId = nativeReading ? null : currentJobId;
  const nativeBusy = nativeReading && !!nativeStatus?.currentJob;

  const ceiling = Math.max(10, Math.ceil((Math.max(trace.peak, benchmarkTokPerSec) * 1.2) / 5) * 5);

  // -------------------------------------------------------------- controls
  const startBlocked = !connected || device.webGPUSupported === false || nativeOnline;

  const controlNote =
    phase === 'signedout'
      ? 'Sign in with an X account or a Solana wallet. Payouts go to a Solana wallet, which can be connected afterwards.'
      : phase === 'nogpu'
        ? 'This machine can still serve from desktop Chrome or Edge, or through a native worker.'
        : phase === 'offline'
          ? nativeOnline
            ? 'The browser worker stays off while a native worker is connected to this account.'
            : !connected
              ? 'Waiting for the orchestrator before the worker can register.'
              : `Browser jobs pay ${model.payout}, settled to your account in USDC.`
          : preparing
            ? 'Keep this tab open and in the foreground while the model downloads.'
            : armed
              ? 'Stopping unregisters this machine, unloads the model and frees the GPU.'
              : phase === 'error'
                ? 'Reset clears the fault and returns the machine to idle.'
                : '';

  // Only worth saying before the worker starts. Under a fault or a running job
  // the sentence would be describing a decision that has already been made.
  const fitWarning = !modelFits && device.detectedVRAM !== null
    && (phase === 'offline' || phase === 'nogpu');

  const earningsKnown = todayEarnings !== null;

  return (
    <div className="iv1">
      <div className="iv1-shell">
        <div className="iv1-rail">
          <a className="iv1-brand" href="/">
            c0mpute<span>worker</span>
          </a>
          <div className="iv1-railright">
            <Pill
              tone={connected ? 'live' : 'steel'}
              label={connected ? 'orchestrator linked' : 'linking'}
              pulse={!connected}
            />
            <a className="iv1-link" href="/">Home</a>
          </div>
        </div>

        <div className="iv1-grid">
          {/* ------------------------------------------------ left: the face */}
          <div className="iv1-col">
            <section className="iv1-panel iv1-panel--face">
              <div className="iv1-panelhead">
                <span className="iv1-label">This machine</span>
                <Pill tone={face.tone} label={face.pill} pulse={face.pulse} />
              </div>

              <h1 className="iv1-headline">{face.headline}</h1>
              <p className="iv1-sub">{face.sub}</p>

              <div className="iv1-channels">
                <Channel
                  value={tokenReading ? rateRead.toFixed(1) : DASH}
                  unit="tok/s"
                  pad={5}
                  label="Throughput"
                />
                <Channel value={tokenReading ? num(tokensRead) : DASH} label="Tokens served" />
                <Channel value={reading ? fmtClockSpan(uptimeSeconds) : DASH} label="Uptime" />
                <Channel
                  value={reading ? num(jobsRead) : DASH}
                  label={nativeReading && nativeImage ? 'Images rendered' : 'Jobs served'}
                />
              </div>

              <div className="iv1-scope">
                <div className="iv1-scopehead">
                  <span className="iv1-label">
                    {preparing ? 'Channel · model fetch' : 'Channel · throughput'}
                  </span>
                  <span className="iv1-scopescale">
                    {preparing ? `${model.size} total` : `0–${ceiling} tok/s`}
                  </span>
                </div>

                {preparing
                  ? <FetchMeter progress={loadProgress} />
                  : <Plot samples={trace.samples} filled={trace.filled} ceiling={ceiling} live={status === 'working'} />}

                <div className={`iv1-scopefoot${preparing ? ' iv1-scopefoot--log' : ''}`}>
                  {preparing ? (
                    <span>{loadingText || 'Waiting for the first chunk.'}</span>
                  ) : (
                    <>
                      <span>60 s window · 1 Hz sample · {trace.filled} taken</span>
                      <span>
                        peak {trace.peak.toFixed(1)}
                        {benchmarkTokPerSec > 0 ? ` · calibrated ${benchmarkTokPerSec.toFixed(1)}` : ''} tok/s
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="iv1-sig">
                {/* Always present, empty before registration: an appearing field
                    would walk the whole face down a row on a phone. */}
                <span className="iv1-tag iv1-tag--id"><b>worker</b><i>{shownWorkerId ?? DASH}</i></span>
                {shownJobId && (
                  <span className="iv1-tag iv1-tag--live"><b>job</b><i>{shownJobId.slice(0, 8)}</i></span>
                )}
                {nativeBusy && (
                  <span className="iv1-tag iv1-tag--live">
                    <b>state</b><i>{nativeImage ? 'rendering' : 'serving'}</i>
                  </span>
                )}
                <span className="iv1-tag"><b>model</b><i>{model.name}</i></span>
                <span className="iv1-tag"><b>pays</b><i>{model.payout}</i></span>
              </div>

              {error && <div className="iv1-fault">{error}</div>}

              <div className="iv1-controls">
                {phase === 'auth' ? (
                  <button className="iv1-btn iv1-btn--ghost" disabled>Checking session</button>
                ) : phase === 'signedout' ? (
                  <button className="iv1-btn iv1-btn--primary" onClick={() => login()}>Sign in</button>
                ) : phase === 'error' ? (
                  <button className="iv1-btn iv1-btn--primary" onClick={engine.reset}>Reset</button>
                ) : armed ? (
                  <button className="iv1-btn iv1-btn--ghost" onClick={engine.stop}>Stop worker</button>
                ) : preparing ? (
                  // No cancel control: the runtime's load has no abort path, so a
                  // button here would return the face to idle while the fetch kept
                  // running and then walked itself back to ready.
                  <button className="iv1-btn iv1-btn--primary" disabled>
                    {status === 'downloading' ? 'Fetching weights' : status === 'connecting' ? 'Registering' : 'Starting'}
                  </button>
                ) : (
                  <button className="iv1-btn iv1-btn--primary" onClick={engine.start} disabled={startBlocked}>
                    Start worker
                  </button>
                )}
              </div>

              {controlNote && <p className="iv1-note">{controlNote}</p>}
              {fitWarning && (
                <p className="iv1-note iv1-note--warn">
                  Detected memory is under what this model asks for. The worker can still be started, and may fail to
                  allocate.
                </p>
              )}
            </section>

            {/* -------------------------------------------------- session log */}
            <section className="iv1-panel">
              <div className="iv1-panelhead">
                <span className="iv1-label">Session log</span>
                <span className="iv1-label">Last 20 jobs</span>
              </div>

              {sessionJobs.length === 0 ? (
                <>
                  <div className="iv1-lrow iv1-lhead">
                    <span className="iv1-lcell">Time</span>
                    <span className="iv1-lcell iv1-lcell--job">Job</span>
                    <span className="iv1-lcell iv1-lcell--num">Tokens</span>
                    <span className="iv1-lcell iv1-lcell--num">Duration</span>
                    <span className="iv1-lcell iv1-lcell--num iv1-lcell--rate">Rate</span>
                    <span className="iv1-lcell iv1-lcell--num">Status</span>
                  </div>
                  <p className="iv1-empty">
                    Each job this machine finishes is written here with its measured token count, wall time and rate.
                    Nothing has been served in this session yet.
                  </p>
                </>
              ) : (
                <Ledger jobs={sessionJobs} />
              )}
            </section>
          </div>

          {/* --------------------------------------------- right: the plates */}
          <div className="iv1-col">
            <section className="iv1-panel">
              <div className="iv1-panelhead">
                <span className="iv1-label">Hardware</span>
                <Pill
                  tone={device.webGPUSupported === null ? 'idle' : device.webGPUSupported ? 'steel' : 'fault'}
                  label={device.webGPUSupported === null ? 'probing' : device.webGPUSupported ? 'webgpu ready' : 'no webgpu'}
                />
              </div>

              <KV k="Graphics" v={device.gpuInfo ?? 'Not detected'} wrap />
              <KV
                k="Vendor"
                v={[device.gpuVendor, device.gpuArchitecture].filter(Boolean).join(' / ') || DASH}
              />
              <KV
                k="Memory, estimated"
                v={device.detectedVRAM !== null ? `${device.detectedVRAM} GB` : DASH}
              />

              <div className="iv1-sect">
                <div className="iv1-label" style={{ marginBottom: 10 }}>Assigned model</div>
                <KV k="Name" v={model.name} />
                <KV k="Download" v={model.size} />
                <KV k="Memory needed" v={model.vram} tone={fitWarning ? 'warn' : undefined} />
                <KV k="Pays" v={model.payout} />
              </div>

              {nativeOnline && (
                <div className="iv1-sect">
                  <div className="iv1-label" style={{ marginBottom: 10 }}>
                    {nativeImage ? 'Native image worker' : 'Native worker'}
                  </div>
                  <KV
                    k={nativeImage ? 'Images rendered' : 'Jobs completed'}
                    v={num(nativeStatus!.jobsCompleted)}
                  />
                  {!nativeImage && (
                    <>
                      <KV k="Tokens" v={num(nativeStatus!.tokensGenerated)} />
                      <KV k="Rate" v={`${nativeStatus!.tokPerSec.toFixed(1)} tok/s`} tone="live" />
                    </>
                  )}
                </div>
              )}
            </section>

            <section className="iv1-panel">
              <div className="iv1-panelhead">
                <span className="iv1-label">Account</span>
                <span className="iv1-label">Paid in USDC</span>
              </div>

              <KV k="Earned, lifetime" v={earningsKnown ? usd(lifetimeEarned) : DASH} big />
              <KV k="Earned, today" v={earningsKnown ? usd(todayEarnings!) : DASH} />
              <KV k="Paid jobs" v={lifetime ? num(lifetime.paidJobs) : DASH} />
              <KV k="Jobs completed" v={lifetime ? num(lifetime.totalJobs) : DASH} />
              <KV k="Tokens generated" v={lifetime ? num(lifetime.totalTokens) : DASH} />

              <p className="iv1-note">
                Browser jobs pay {model.payout}. Paid jobs exclude the network&apos;s canary probes, which are
                anti-cheat checks and pay nothing.
              </p>
            </section>

            <section className="iv1-panel">
              <div className="iv1-panelhead">
                <span className="iv1-label">Network</span>
                <Pill tone={connected ? 'live' : 'steel'} label={connected ? 'linked' : 'linking'} pulse={!connected} />
              </div>

              {networkStats ? (
                <>
                  <PeerArray
                    online={networkStats.workersOnline}
                    native={networkStats.nativeWorkers || 0}
                    you={armed}
                  />
                  <KV k="Machines serving" v={num(networkStats.workersOnline)} />
                  <KV
                    k="Browser / native"
                    v={`${num(networkStats.browserWorkers || 0)} / ${num(networkStats.nativeWorkers || 0)}`}
                  />
                  <KV k="Jobs waiting" v={num(networkStats.jobsInQueue)} />
                  <KV k="Network jobs" v={num(networkStats.jobsCompleted)} />
                  <KV k="Network tokens" v={num(networkStats.tokensGenerated)} />
                  <KV k="Average job" v={`${(networkStats.avgJobDurationMs / 1000).toFixed(1)} s`} />
                </>
              ) : (
                <p className="iv1-empty">Waiting for the orchestrator to report the network.</p>
              )}
            </section>
          </div>
        </div>

        <p className="iv1-foot">
          The browser worker is live today: this tab registers with the orchestrator, receives jobs, and is paid for the
          ones it completes. A larger network, where machines hold one model between them, is launching.
        </p>
      </div>
    </div>
  );
}

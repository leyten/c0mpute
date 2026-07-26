'use client';

// Earn, variant 3: "the membership".
//
// A visitor arrives to find a network of machines already serving, an open
// place in it, and one machine that can be theirs. The page reads in that
// order: the card (who you are here), the company (the machines serving right
// now, with yours marked), this machine (what you brought), your standing
// (what it has done), then what is coming.
//
// Every value comes from useWorkerEngine. Fields the engine does not return
// are absent from the page rather than filled in.
import './ui.css';

import { useWorkerEngine } from '../engine/useWorkerEngine';
import {
  Eyebrow, Fact, LiveDot, Progress, Register, Roster,
  buildRoster, fmtDuration, fmtInt, fmtSecs, fmtUsd,
} from './parts';

type Standing =
  | 'checking'   // auth is still resolving
  | 'guest'      // signed out
  | 'native'     // a native worker holds this account's place
  | 'problem'    // the worker errored
  | 'blocked'    // this browser cannot run a worker
  | 'joining'    // initializing, downloading, registering
  | 'counted'    // registered and serving
  | 'open';      // signed in, worker idle

export default function EarnMembershipPage() {
  const {
    authLoading, isAuthenticated, login,
    connected, networkStats, nativeStatus,
    device, model, models, selectedModel, selectModel, modelFits,
    status, error, loadProgress, loadingText, workerId, currentJobId, benchmarkTokPerSec,
    session, sessionJobs, uptimeSeconds, lifetime, todayEarnings, lifetimeEarned,
    start, stop, reset,
  } = useWorkerEngine();

  const nativeOnline = isAuthenticated && !!nativeStatus?.online;
  const preparing = status === 'initializing' || status === 'downloading' || status === 'connecting';
  const serving = status === 'ready' || status === 'working';
  // Registration requires an account, so signing out ends membership even
  // though the tab's own worker state survives the logout.
  const counted = isAuthenticated && serving;

  // A native worker holds the place whether or not this tab also serves, so it
  // outranks the tab's error state. The error itself is still shown.
  const standing: Standing =
    authLoading ? 'checking'
    : !isAuthenticated ? 'guest'
    : nativeOnline ? 'native'
    : status === 'error' ? 'problem'
    : device.webGPUSupported === false && !serving ? 'blocked'
    : preparing ? 'joining'
    : serving ? 'counted'
    : 'open';

  const memberId = isAuthenticated ? workerId ?? nativeStatus?.workerId ?? null : null;
  // The orchestrator reports a native worker's job as a busy flag, not an id,
  // so only the tab's own job is named.
  const workingHere = status === 'working' && !!currentJobId;
  const workingNative = nativeOnline && !!nativeStatus?.currentJob;
  const working = workingHere || workingNative;

  const tone =
    counted || nativeOnline ? 'var(--m3-live)'
    : standing === 'joining' ? 'var(--m3-steel)'
    : standing === 'problem' || standing === 'blocked' ? 'var(--m3-warn)'
    : 'var(--m3-faint)';

  const statusLabel =
    standing === 'checking' ? 'Checking your account'
    : standing === 'guest' ? 'Signed out'
    : standing === 'native' ? (workingNative ? 'Native worker serving' : 'Native worker standing by')
    : standing === 'problem' ? 'Did not register'
    : standing === 'blocked' ? 'Cannot serve here'
    : standing === 'joining' ? 'Joining'
    : workingHere ? 'Serving'
    : standing === 'counted' ? 'Standing by'
    : 'Idle';

  const headline =
    standing === 'checking' ? 'Checking your account'
    : standing === 'guest' ? 'Take a place in the network'
    : standing === 'native' ? 'Counted through your native worker'
    : standing === 'problem' ? 'The join did not complete'
    : standing === 'blocked' ? 'This browser cannot serve'
    : standing === 'joining' ? 'Taking your place'
    : standing === 'counted' ? 'This machine is counted'
    : 'Your place is open';

  const joiningLede =
    status === 'downloading' ? 'The model is downloading to this machine. It registers once the download finishes.'
    : status === 'connecting' ? 'The model is loaded. This machine is registering with the network.'
    : 'The worker is starting up on this machine.';

  const lede =
    standing === 'checking' ? 'One moment.'
    : standing === 'guest' ? 'The browser worker is live today. Sign in, start it, and this machine serves real requests beside every other machine on the network.'
    : standing === 'native' ? 'A native worker is connected under this account and serving in the background.'
    : standing === 'problem' ? 'This machine did not register. Read the message below, then try again.'
    : standing === 'blocked' ? 'Running a worker in this tab needs WebGPU. Chrome or Edge on a machine with a dedicated GPU can serve.'
    : standing === 'joining' ? joiningLede
    : standing === 'counted' ? 'This machine is registered under your account and serving the requests the network sends it. It keeps its place until you stop it.'
    : 'Start the worker and this machine registers under your account, takes a member id, and serves requests until you stop it.';

  const canStart = connected && device.webGPUSupported === true && modelFits;

  const note =
    standing === 'checking' ? null
    : standing === 'guest' ? 'Sign in with X. A Solana wallet for payouts can be linked later in settings.'
    : standing === 'native' ? (serving
        ? 'This tab is registered as well. Stopping it leaves your native worker running.'
        : 'This tab is idle while your native worker holds the account.')
    : standing === 'problem' ? 'Trying again returns this machine to idle so you can start the join again.'
    : standing === 'blocked' ? 'Nothing runs on this machine until a browser with WebGPU is used.'
    : standing === 'joining' ? 'Keep this tab open while the model downloads to this machine.'
    : standing === 'counted' ? 'Stopping unregisters this machine and frees your GPU.'
    : `One-time download of ${model.size}. Completed jobs pay ${model.payout}.`;

  const pendingIdNote =
    standing === 'checking' ? null
    : standing === 'guest' ? 'Issued once you sign in and start the worker.'
    : standing === 'blocked' ? 'This browser cannot register a member id.'
    : 'Issued when this machine registers.';

  // The orchestrator counts an image worker in the browser bucket and only
  // type 'native' in the native one, so this machine is subtracted from the
  // bucket it was actually counted in.
  const mineInBrowser = (counted ? 1 : 0) + (nativeOnline && nativeStatus?.type === 'image' ? 1 : 0);
  const mineInNative = nativeOnline && nativeStatus?.type !== 'image' ? 1 : 0;
  const dots = buildRoster(networkStats, mineInBrowser, mineInNative);

  const rightNow =
    workingHere ? `Serving job ${currentJobId!.slice(0, 8)}.`
    : workingNative ? 'Your native worker is serving a request.'
    : counted ? 'Standing by. The network assigns the next job.'
    : nativeOnline ? 'Your native worker is connected and standing by.'
    : preparing ? 'Preparing to serve.'
    : status === 'error' ? 'Stopped after an error.'
    : 'Idle. Nothing is running on your GPU.';

  // Session figures come from the native worker whenever one is connected,
  // because that is the machine doing the work for this account.
  const servedNow = nativeOnline ? nativeStatus!.jobsCompleted : session.jobsCompleted;
  const tokensNow = nativeOnline ? nativeStatus!.tokensGenerated : session.tokensGenerated;

  const speedValue = nativeOnline
    ? (nativeStatus!.tokPerSec > 0 ? `${nativeStatus!.tokPerSec.toFixed(1)} tok/s` : 'Not reported')
    : benchmarkTokPerSec > 0 ? `${benchmarkTokPerSec.toFixed(1)} tok/s`
    : device.webGPUSupported === false ? 'Not available'
    : 'Measured at registration';

  const earnedLine = lifetimeEarned > 0 || (todayEarnings !== null && todayEarnings > 0)
    ? `${fmtUsd(lifetimeEarned)} earned to date${todayEarnings !== null ? `, ${fmtUsd(todayEarnings)} of it today` : ''}.`
    : null;

  return (
    <div className="m3">
      <div className="m3-wrap">
        {/* the page opens on the wordmark and the wire, with no header bar */}
        <div className="flex items-center justify-between gap-4">
          <a href="/" className="m3-mark">c0mpute</a>
          <span className="m3-note inline-flex items-center gap-2 shrink-0">
            <LiveDot tone={connected ? 'var(--m3-live)' : 'var(--m3-faint)'} />
            {connected ? 'Network connected' : 'Connecting to the network'}
          </span>
        </div>

        {/* ---------------------------------------------------- the card */}
        <section className="m3-slab mt-10 md:mt-14 m3-fade">
          <div className="flex items-center justify-between gap-4">
            <Eyebrow>Membership</Eyebrow>
            <span className="m3-note inline-flex items-center gap-2 shrink-0" style={{ color: tone }} data-testid="v3-status">
              <LiveDot tone={tone} pulse={working} />
              {statusLabel}
            </span>
          </div>

          <div className="mt-7 flex flex-col gap-9 lg:flex-row lg:gap-12">
            <div className="min-w-0 flex-1">
              <h1 className="m3-display">{headline}</h1>
              <p className="m3-lede mt-4">{lede}</p>

              {standing === 'joining' && (
                <div className="mt-8 max-w-md">
                  <Progress value={loadProgress} text={loadingText || 'Preparing'} />
                </div>
              )}

              {error && (
                <div className="m3-inset mt-7 max-w-md" data-testid="v3-error">
                  <div className="m3-eyebrow" style={{ color: 'var(--m3-warn)' }}>Message</div>
                  <p className="m3-note mt-2" style={{ color: 'var(--m3-dim)' }}>{error}</p>
                </div>
              )}

              {isAuthenticated && !modelFits && !nativeOnline && (
                <div className="m3-inset mt-7 max-w-md" data-testid="v3-fit-warning">
                  <div className="m3-eyebrow" style={{ color: 'var(--m3-warn)' }}>Below the minimum</div>
                  <p className="m3-note mt-2" style={{ color: 'var(--m3-dim)' }}>
                    This machine estimates {device.detectedVRAM} GB of usable video memory. {model.name} needs {model.vram} to run.
                  </p>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-col gap-5 lg:w-[248px]">
              <div>
                <Eyebrow>Member id</Eyebrow>
                {memberId ? (
                  <div className="m3-id mt-2.5 m3-fade" data-testid="v3-member-id">{memberId}</div>
                ) : (
                  <div data-testid="v3-member-id-pending">
                    <div className="m3-id-pending mt-4" />
                    {pendingIdNote ? <p className="m3-note mt-3">{pendingIdNote}</p> : null}
                  </div>
                )}
              </div>

              {/* A registered tab always keeps its stop control, including when
                  a native worker connects underneath it. */}
              {serving && isAuthenticated ? (
                <button className="m3-btn m3-btn--quiet" onClick={stop} data-testid="v3-stop">Stop the worker</button>
              ) : standing === 'guest' ? (
                <button className="m3-btn" onClick={() => login()}>Sign in with X</button>
              ) : standing === 'problem' ? (
                <button className="m3-btn m3-btn--quiet" onClick={reset}>Try again</button>
              ) : standing === 'joining' ? (
                <button className="m3-btn" disabled>
                  {status === 'downloading' ? 'Downloading model' : status === 'connecting' ? 'Registering' : 'Starting'}
                </button>
              ) : standing === 'open' ? (
                <button className="m3-btn" onClick={start} disabled={!canStart} data-testid="v3-start">
                  {!connected ? 'Waiting for the network'
                    : device.webGPUSupported === null ? 'Checking this machine'
                    : !modelFits ? 'GPU below the minimum'
                    : 'Start the worker'}
                </button>
              ) : null}

              {note ? <p className="m3-note">{note}</p> : null}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- the company */}
        <section className="mt-16 md:mt-20">
          <h2 className="m3-eyebrow">Machines serving right now</h2>
          <div className="mt-6">
            {connected && networkStats ? (
              <Roster dots={dots} mine={mineInBrowser + mineInNative} />
            ) : (
              <p className="m3-note">Waiting to hear from the network.</p>
            )}
          </div>

          {connected && networkStats && (
            <div className="mt-9 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
              <Fact label="Browser workers" value={fmtInt(networkStats.browserWorkers)} hint="Running in a tab" />
              <Fact label="Native workers" value={fmtInt(networkStats.nativeWorkers)} hint="Running as an app" />
              <Fact label="Waiting in queue" value={fmtInt(networkStats.jobsInQueue)} hint="Jobs unassigned" />
              <Fact
                label="Average job"
                value={networkStats.avgJobDurationMs > 0 ? fmtSecs(networkStats.avgJobDurationMs) : 'Not reported'}
              />
            </div>
          )}
        </section>

        {/* --------------------------------------------- what you brought */}
        <section className="mt-16 md:mt-20">
          <h2 className="m3-eyebrow">This machine</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            <Fact
              label="GPU"
              value={device.gpuInfo ?? (device.webGPUSupported === false ? 'No WebGPU device' : 'Detecting')}
              hint={[device.gpuVendor, device.gpuArchitecture].filter(Boolean).join(', ') || null}
            />
            <Fact
              label="Video memory"
              value={device.detectedVRAM !== null ? `${device.detectedVRAM} GB` : 'Not reported'}
              hint={device.detectedVRAM !== null ? 'Estimated from WebGPU limits' : null}
            />
            <Fact label="Model" value={model.name} hint={`${model.size} download, needs ${model.vram}`} />
            <Fact
              label="Measured speed"
              value={speedValue}
              hint={nativeOnline ? 'Native worker' : benchmarkTokPerSec > 0 ? 'On this machine' : null}
            />
          </div>

          {models.length > 1 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {models.map(m => (
                <button
                  key={m.id}
                  onClick={() => selectModel(m.id)}
                  disabled={status !== 'offline'}
                  className="rounded-full px-3.5 py-2 text-[13px] transition-colors"
                  style={{
                    background: m.id === selectedModel ? 'var(--m3-surface-hi)' : 'var(--m3-surface)',
                    color: m.id === selectedModel ? 'var(--m3-text)' : 'var(--m3-dim)',
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          <div className="m3-inset mt-9 flex items-center gap-2.5">
            <LiveDot tone={tone} pulse={working} />
            <span className="text-[13.5px] min-w-0" style={{ color: 'var(--m3-dim)' }} data-testid="v3-rightnow">{rightNow}</span>
          </div>
        </section>

        {/* -------------------------------------------------- your standing */}
        {isAuthenticated && (
          <section className="mt-16 md:mt-20">
            <h2 className="m3-eyebrow">Your standing</h2>
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
              <Fact label={nativeOnline ? 'Served' : 'Served this session'} value={fmtInt(servedNow)} />
              <Fact label={nativeOnline ? 'Tokens' : 'Tokens this session'} value={fmtInt(tokensNow)} />
              <Fact label={nativeOnline ? 'Connected for' : 'Time serving'} value={fmtDuration(uptimeSeconds)} />
              <Fact label="Rate" value={model.payout} hint="Browser worker" />
            </div>

            {(lifetime || earnedLine) && (
              <p className="m3-lede mt-9" data-testid="v3-lifetime">
                {lifetime ? `Since you joined, this account has been paid for ${fmtInt(lifetime.paidJobs)} jobs and has generated ${fmtInt(lifetime.totalTokens)} tokens. ` : ''}
                {earnedLine ?? ''}
              </p>
            )}

            <div className="mt-11">
              <h3 className="m3-eyebrow">Served from this tab</h3>
              <div className="mt-5">
                <Register
                  jobs={sessionJobs}
                  empty={nativeOnline
                    ? 'This tab has served nothing. Your native worker records its jobs on your account.'
                    : 'Nothing served in this session yet. Jobs are assigned by the network.'}
                />
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------- what is coming */}
        <section className="mt-16 md:mt-20">
          <h2 className="m3-eyebrow">What you are joining</h2>
          <div className="mt-6 flex flex-col gap-4">
            <p className="m3-lede">
              The browser worker is live today. It takes real requests from the c0mpute network and runs them on your
              GPU. Completed jobs pay {model.payout}. The tab has to stay open, and the model downloads once.
            </p>
            <p className="m3-lede">
              A second network, betanet, is launching. It will split one large model across many machines so a swarm
              can serve models that no single consumer GPU can hold. The browser worker on this page runs today and
              does not wait on that launch.
            </p>
          </div>
          <div className="mt-9">
            <a href="/" className="m3-link">Back to c0mpute</a>
          </div>
        </section>
      </div>
    </div>
  );
}

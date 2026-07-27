'use client';

import { useRouter } from 'next/navigation';

import { useWorkerEngine } from '../engine/useWorkerEngine';
import NativeWorkerCard from '../NativeWorkerCard';
import {
  ACCENT,
  GREEN,
  StageRail,
  MetricTile,
  EarningsPanel,
  DevicePanel,
  NetworkPanel,
} from '../panels';

export default function WorkerPage() {
  const router = useRouter();
  const engine = useWorkerEngine();

  const {
    authLoading, isAuthenticated, login, getAccessToken,
    connected: isConnected, networkStats, nativeStatus,
    device, model, modelFits,
    status, error, loadProgress, loadingText, workerId, currentJobId, benchmarkTokPerSec,
    session, sessionJobs, uptimeSeconds, lifetime, todayEarnings, lifetimeEarned,
  } = engine;

  // Format uptime
  const formatUptime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ---------------------------------------------------------------- derived
  // Presentation values only. All worker state lives in the engine hook.

  const isNativeOnline = !!nativeStatus?.online;
  const isPreparing = status === 'initializing' || status === 'downloading' || status === 'connecting';

  const heroStage = isNativeOnline
    ? (nativeStatus?.currentJob ? 3 : 2)
    : status === 'offline' ? 0
    : isPreparing ? 1
    : status === 'ready' ? 2
    : status === 'working' ? 3
    : 1; // error: mark the preparing stage

  const heroHeadline = isNativeOnline
    ? (nativeStatus?.currentJob ? 'Serving a job' : 'Ready for jobs')
    : status === 'offline' ? 'Worker offline'
    : status === 'initializing' ? 'Starting up'
    : status === 'downloading' ? 'Downloading model'
    : status === 'connecting' ? 'Registering'
    : status === 'ready' ? 'Ready for jobs'
    : status === 'working' ? 'Serving a job'
    : 'Worker error';

  const heroSub = isNativeOnline
    ? (nativeStatus?.type === 'image'
        ? 'Your native image worker is connected and rendering jobs in the background.'
        : 'Your native worker is connected and serving jobs in the background.')
    : status === 'offline'
      ? 'Start the worker to serve jobs from this browser tab. The model downloads once and runs on your GPU.'
    : isPreparing
      ? (loadingText || 'Preparing the worker.')
    : status === 'ready'
      ? 'This machine is live on the network. Jobs are assigned automatically and every completed job pays out.'
    : status === 'working'
      ? 'Generating tokens for a live request right now.'
      : 'The worker hit a problem. Review the message below and try again.';

  const heroDotColor = isNativeOnline || status === 'ready' || status === 'working'
    ? GREEN
    : isPreparing ? ACCENT
    : status === 'error' ? 'rgba(248,113,113,0.9)'
    : 'rgba(255,255,255,0.3)';

  const heroStatusLabel = isNativeOnline
    ? (nativeStatus?.currentJob ? 'Serving' : 'Ready')
    : status === 'offline' ? 'Offline'
    : isPreparing ? 'Preparing'
    : status === 'ready' ? 'Ready'
    : status === 'working' ? 'Serving'
    : 'Error';

  const displayedWorkerId = isNativeOnline ? nativeStatus?.workerId ?? null : workerId;
  const displayedJobId = isNativeOnline ? nativeStatus?.currentJob ?? null : currentJobId;

  const jobsDisplayed = lifetime?.paidJobs ?? (isNativeOnline ? nativeStatus!.jobsCompleted : session.jobsCompleted);

  const speedValue = isNativeOnline && nativeStatus?.type === 'image'
    ? String(nativeStatus.jobsCompleted)
    : isNativeOnline
      ? nativeStatus!.tokPerSec.toFixed(1)
      : benchmarkTokPerSec > 0 ? benchmarkTokPerSec.toFixed(1) : '-';
  const speedLabel = isNativeOnline && nativeStatus?.type === 'image' ? 'Images rendered' : 'Speed, tok/s';

  const tokensServed = isNativeOnline ? nativeStatus!.tokensGenerated : session.tokensGenerated;

  // Show login prompt if not authenticated
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-4">
        <div className="w-full max-w-md border border-white/10 bg-white/[0.02] rounded-2xl p-8 md:p-10 text-center">
          <div className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.16em] mb-5">Worker dashboard</div>
          <h1 className="pixel-serif text-white text-3xl mb-3">Sign in to start earning</h1>
          <p className="pixel-sans text-white/60 text-sm mb-8 leading-relaxed">
            Sign in with your X account to run a worker on this machine. You can connect a Solana wallet for payouts later in Settings.
          </p>
          <button
            onClick={() => login()}
            className="cursor-pointer w-full pixel-serif text-base px-8 py-3.5 rounded-xl bg-white text-black hover:bg-white/90 transition-colors"
          >
            Sign in with X
          </button>
          <div className="mt-5">
            <a href="/" className="cursor-pointer pixel-sans text-white/50 text-xs hover:text-white/80 transition-colors">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4">
        <div className="max-w-6xl mx-auto px-4 md:px-6">
          <nav className="bg-black/80 backdrop-blur-sm border border-white/10 rounded-2xl px-4 md:px-6 py-3 flex items-center justify-between">
            <div className="flex-1">
              <a href="/" className="cursor-pointer pixel-serif-logo text-white text-lg md:text-xl font-bold flex items-center">
                c<span className="pixel-serif-logo" style={{ fontSize: '1.8em', display: 'inline-block', verticalAlign: 'baseline', lineHeight: '1', marginTop: '-0.3em' }}>0</span>mpute
              </a>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="cursor-pointer pixel-sans text-sm text-white/70 hover:text-white transition-colors"
              >
                ← Back
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-4 md:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Page header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <div className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.16em] mb-3">Earn</div>
              <h1 className="pixel-serif text-white text-4xl md:text-5xl mb-3">Worker dashboard</h1>
              <p className="pixel-sans text-white/60 text-base">
                Serve AI jobs from this machine and get paid in <span className="dollar">$</span>USDC.
              </p>
            </div>
            <div className="md:text-right">
              <div
                className="pixel-sans text-sm flex items-center gap-2 md:justify-end"
                style={{ color: isConnected ? GREEN : ACCENT }}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                {isConnected ? 'Connected to orchestrator' : 'Connecting...'}
              </div>
              {networkStats && isConnected && (
                <p className="pixel-sans text-white/50 text-sm mt-1">
                  {networkStats.workersOnline} workers online
                  {(networkStats.browserWorkers > 0 || networkStats.nativeWorkers > 0) && (
                    <span className="text-white/40"> ({networkStats.browserWorkers || 0} browser, {networkStats.nativeWorkers || 0} native)</span>
                  )}
                  {' '}· {networkStats.jobsInQueue} in queue
                </p>
              )}
            </div>
          </div>

          {/* WebGPU Check */}
          {device.webGPUSupported === false && (
            <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-4 mb-6">
              <p className="pixel-sans text-red-400 text-sm">
                WebGPU is not supported in your browser. Use Chrome or Edge to run a browser worker, or set up a native worker below.
              </p>
            </div>
          )}

          {/* Hero: worker state machine */}
          <div className="border border-white/10 bg-white/[0.02] rounded-2xl p-7 md:p-9 mb-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-4">
                  <span className="pixel-sans text-white/40 text-[10px] uppercase tracking-[0.16em]">This machine</span>
                  {isNativeOnline && (
                    <span className="pixel-sans text-[10px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-md bg-[#80a0c1]/15 text-[#80a0c1] border border-[#80a0c1]/30">
                      {nativeStatus?.type === 'image' ? 'Image worker' : 'Native worker'}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 mb-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${(isNativeOnline && nativeStatus?.currentJob) || status === 'working' ? 'animate-pulse' : ''}`}
                    style={{ backgroundColor: heroDotColor }}
                  />
                  <h2 className="pixel-serif text-white text-3xl md:text-4xl">{heroHeadline}</h2>
                </div>
                <p className="pixel-sans text-white/60 text-sm max-w-xl mb-7 leading-relaxed">{heroSub}</p>

                <StageRail stage={heroStage} errored={status === 'error' && !isNativeOnline} />

                {/* Progress bar while preparing */}
                {isPreparing && !isNativeOnline && (
                  <div className="mt-7 max-w-lg">
                    <div className="flex justify-between mb-2">
                      <span className="pixel-sans text-white/60 text-xs truncate pr-4">{loadingText}</span>
                      <span className="pixel-sans text-[#80a0c1] text-xs shrink-0">{Math.round(loadProgress * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${loadProgress * 100}%`, backgroundColor: ACCENT }}
                      />
                    </div>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="mt-6 p-3 border border-red-500/30 bg-red-500/10 rounded-lg max-w-lg">
                    <p className="pixel-sans text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {/* Identity details */}
                {(displayedWorkerId || displayedJobId) && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {displayedWorkerId && (
                      <span className="pixel-sans text-white/50 text-xs px-2.5 py-1.5 bg-white/[0.03] border border-white/5 rounded-lg">
                        Worker <span className="font-mono text-white/70">{displayedWorkerId.slice(0, 8)}</span>
                      </span>
                    )}
                    {displayedJobId && (
                      <span className="pixel-sans text-xs px-2.5 py-1.5 rounded-lg border border-emerald-400/25 bg-emerald-400/10" style={{ color: GREEN }}>
                        Job <span className="font-mono">{displayedJobId.slice(0, 8)}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action column */}
              <div className="lg:w-64 shrink-0 flex flex-col gap-3">
                <div className="pixel-sans text-xs flex items-center gap-2 lg:justify-end" style={{ color: heroDotColor }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {heroStatusLabel}
                </div>

                {status === 'offline' ? (
                  <button
                    onClick={engine.start}
                    disabled={!device.webGPUSupported || !isConnected || !!nativeStatus?.online}
                    className="w-full pixel-serif text-base py-4 rounded-xl bg-white text-black hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {nativeStatus?.online ? 'Native worker running' : !isConnected ? 'Waiting for connection' : 'Start browser worker'}
                  </button>
                ) : status === 'ready' ? (
                  <button
                    onClick={engine.stop}
                    className="cursor-pointer w-full pixel-serif text-base py-4 rounded-xl border border-white/20 text-white hover:bg-white/5 transition-colors"
                  >
                    Stop worker
                  </button>
                ) : status === 'error' ? (
                  <button
                    onClick={engine.reset}
                    className="cursor-pointer w-full pixel-serif text-base py-4 rounded-xl border border-white/20 text-white hover:bg-white/5 transition-colors"
                  >
                    Try again
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full pixel-serif text-base py-4 rounded-xl bg-white/15 text-white/60 cursor-not-allowed"
                  >
                    {status === 'downloading' ? 'Downloading model' :
                     status === 'initializing' ? 'Starting' :
                     status === 'connecting' ? 'Registering' :
                     status === 'working' ? 'Serving job' : 'Loading'}
                  </button>
                )}

                <p className="pixel-sans text-white/40 text-xs lg:text-right leading-relaxed">
                  {isNativeOnline
                    ? 'Browser serving is paused while your native worker runs.'
                    : status === 'offline'
                      ? `One-time model download of ${model.size}. Pays ${model.payout}.`
                    : status === 'ready' || status === 'working'
                      ? 'Stopping unloads the model and frees your GPU.'
                    : status === 'error'
                      ? 'Resetting returns the worker to idle so you can start again.'
                      : 'Keep this tab open while the worker prepares.'}
                </p>
              </div>
            </div>

            {/* Session metrics */}
            <div className="mt-8 pt-6 border-t border-white/5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Uptime" value={formatUptime(uptimeSeconds)} mono />
              <MetricTile label="Jobs" value={jobsDisplayed} />
              <MetricTile label="Tokens served" value={tokensServed.toLocaleString('en-US')} />
              <MetricTile label={speedLabel} value={speedValue} />
            </div>
          </div>

          {/* Earnings + device + network */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12 items-start">
            <div className="lg:col-span-2">
              <EarningsPanel
                lifetimeEarned={lifetimeEarned}
                todayEarnings={todayEarnings}
                paidJobs={lifetime?.paidJobs ?? null}
                totalTokens={lifetime?.totalTokens ?? null}
                browserRate={model.payout}
                jobs={sessionJobs}
              />
            </div>
            <div className="flex flex-col gap-6">
              <DevicePanel
                gpuInfo={device.gpuInfo}
                gpuVendor={device.gpuVendor}
                gpuArchitecture={device.gpuArchitecture}
                detectedVRAM={device.detectedVRAM}
                webGPUSupported={device.webGPUSupported}
                modelName={model.name}
                modelSize={model.size}
                modelVram={model.vram}
                modelRate={model.payout}
                fits={modelFits}
              />
              <NetworkPanel
                stats={networkStats}
                isConnected={isConnected}
                isWorkerActive={status === 'ready' || status === 'working'}
              />
            </div>
          </div>

          {/* Native worker upgrade */}
          <div className="mb-5">
            <h2 className="pixel-serif text-white text-2xl md:text-3xl mb-1.5">Earn more with a native worker</h2>
            <p className="pixel-sans text-white/60 text-sm">
              The browser worker is the easiest way to start. A native worker runs bigger models and pays up to 10x more per job.
            </p>
          </div>
          <NativeWorkerCard getAccessToken={getAccessToken} />
        </div>
      </main>
    </div>
  );
}

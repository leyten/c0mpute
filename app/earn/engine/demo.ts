// PREVIEW-ONLY demo driver for the worker dashboard: with no orchestrator and
// no WebGPU, this writes the same state the real path writes — a detected
// device, a model that downloads, a registration, then jobs that arrive,
// stream and settle — so the whole page can be judged end to end. Deleted at
// flip time along with the preview flag.
import type { NetworkStats } from '@/lib/orchestrator/types';
import type { SessionJob, WorkerDevice, WorkerLifetimeStats, WorkerStatus } from './useWorkerEngine';

export const DEMO_MODE = process.env.NEXT_PUBLIC_PREVIEW_MODE === '1';

// Fake-but-plausible fixtures so device, network and account UI is visible in
// the preview. Demo-only, behind basic auth; never ships.
export const DEMO_DEVICE: WorkerDevice = {
  webGPUSupported: true,
  gpuInfo: 'NVIDIA GeForce RTX 4070',
  gpuVendor: 'nvidia',
  gpuArchitecture: 'ada-lovelace',
};

export const DEMO_NETWORK_STATS: NetworkStats = {
  workersOnline: 9,
  browserWorkers: 6,
  nativeWorkers: 3,
  nativeByModel: { 'qwen3.8-27b-uncensored': 3 },
  jobsInQueue: 2,
  jobsCompleted: 14206,
  tokensGenerated: 10412883,
  avgJobDurationMs: 6100,
};

// Costed per token, because that is how the network bills now. A worker keeps
// $0.63 per million output tokens (the $0.90/M rate at the base 70% share), so
// the lifetime figure is just totalTokens x that, and the account numbers agree
// with each other by construction rather than by a flat per-job figure that no
// longer exists.
//
// The WORK is scaled up, not the rate: this is a machine that has been serving
// for months, which is what makes a preview dashboard worth looking at. Tokens
// per job stay at the measured ~522. Nothing here flatters the rate.
export const DEMO_LIFETIME: WorkerLifetimeStats = {
  totalJobs: 41_200,
  paidJobs: 38_800,
  totalTokens: 21_493_000,
  totalEarningPoints: 13_540,
};

// 21.493M tokens x $0.63/M = $13.54. Today is the same slice of it as before.
export const DEMO_EARNINGS = { lifetime: 13.54, today: 0.91 };

const WORKER_ID = 'w_4f8c21ba9d3e07';
const BENCH_TOK_PER_SEC = 20.4;
// What the worker keeps per output token: $0.90 per million at the base 70%
// share. A demo job is a few hundred tokens, so a single one is worth a
// fraction of a cent -- which is the honest number, and the reason the headline
// on /earn is quoted per million tokens instead of per job.
const WORKER_USD_PER_TOKEN = (0.9 * 0.7) / 1_000_000;
const MODEL_MB = 4312;

// Cadence, in ms. Load runs ~13s so progress is visibly climbing on arrival,
// then a job lands every few seconds for the rest of the session.
const BOOT_MS = 600;
const INIT_MS = 900;
const DOWNLOAD_STEPS = 24;
const DOWNLOAD_STEP_MS = 400;
const BENCH_MS = 1200;
const REGISTER_MS = 700;
const FIRST_JOB_MS = 2500;
const JOB_GAP_MS = 5000;
const TOKEN_STEP_MS = 250;
const TOKENS_PER_STEP = 5;

// Job sizes cycle so the session list fills with a plausible spread rather
// than one repeated row.
const JOB_STEPS = [26, 34, 22, 40, 30];

/** What the engine lets the demo write. Every field lands in real worker state. */
export interface DemoSink {
  status: (status: WorkerStatus) => void;
  progress: (value: number, text: string) => void;
  registered: (workerId: string, tokPerSec: number) => void;
  jobStarted: (jobId: string) => void;
  tokens: (n: number) => void;
  jobFinished: (job: SessionJob, earnedUsd: number) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const jobId = () =>
  Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')).join('');

/** Starts the scripted session. Returns the stop function. */
export function runWorkerDemo(sink: DemoSink): () => void {
  let cancelled = false;

  (async () => {
    await sleep(BOOT_MS);
    if (cancelled) return;

    sink.status('initializing');
    sink.progress(0, 'Initializing WebLLM...');
    await sleep(INIT_MS);
    if (cancelled) return;

    sink.status('downloading');
    const startedAt = Date.now();
    for (let step = 1; step <= DOWNLOAD_STEPS; step++) {
      await sleep(DOWNLOAD_STEP_MS);
      if (cancelled) return;
      const value = step / DOWNLOAD_STEPS;
      const secs = Math.round((Date.now() - startedAt) / 1000);
      sink.progress(
        value,
        `Fetching param cache[${step}/${DOWNLOAD_STEPS}]: ${Math.round(value * MODEL_MB)}MB fetched. ${Math.round(value * 100)}% completed, ${secs} secs elapsed.`,
      );
    }

    sink.status('connecting');
    sink.progress(1, 'Benchmarking speed...');
    await sleep(BENCH_MS);
    if (cancelled) return;

    sink.progress(1, `Registering (${BENCH_TOK_PER_SEC.toFixed(1)} tok/s)...`);
    await sleep(REGISTER_MS);
    if (cancelled) return;
    sink.registered(WORKER_ID, BENCH_TOK_PER_SEC);

    await sleep(FIRST_JOB_MS);
    for (let n = 0; !cancelled; n++) {
      const id = jobId();
      const steps = JOB_STEPS[n % JOB_STEPS.length];
      const at = Date.now();
      sink.jobStarted(id);
      for (let i = 0; i < steps; i++) {
        await sleep(TOKEN_STEP_MS);
        if (cancelled) return;
        sink.tokens(TOKENS_PER_STEP);
      }
      const jobTokens = steps * TOKENS_PER_STEP;
      sink.jobFinished(
        { id, at, tokens: jobTokens, ms: Date.now() - at, status: 'completed' },
        jobTokens * WORKER_USD_PER_TOKEN,
      );
      await sleep(JOB_GAP_MS);
      if (cancelled) return;
    }
  })();

  return () => { cancelled = true; };
}

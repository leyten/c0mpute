import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerInfo,
  WorkerCapabilities,
  Job,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  ServerToClientEvents,
  ClientToServerEvents,
  NetworkStats,
  getModelTier,
  workerServesModel,
  selectionWeight,
} from './types';
import { verifyPrivyToken } from '../privy-server';
import { incrementPromptsSent, verifyWorkerToken, recordCompletedJob, recordEarning, spendCredits, getCreditBalance, refundCredits, isWorkerBanned, recordWorkerStrike, recordCanaryResult, consumeFreePrompt, getTodayFreeSubsidyUsd, getThisHourFreeSubsidyUsd, anonGrantFreePrompt, profileHasLogin, getAccountAgeMs } from '../db';
import { FREE_PROMPT_LIMIT, FREE_SUBSIDY_DAILY_CAP_USD, FREE_SUBSIDY_HOURLY_CAP_USD, STAKER_ALLOWANCE_ENABLED, ANON_FREE_PROMPT_LIMIT, ANON_IP_DAILY_CAP, WORKER_STAKED_REVENUE_SHARE } from '../tokenomics';
import { verifyAnonToken } from '../anon-auth';
import { CREDITS_PER_USD } from '../token-price';
import { getWorkerRevenueShare } from '../staking';
import { consumeStakerAllowance, recordStakerRequest } from '../staker-allowance';
import { scanOutput, BLOCKED_MESSAGE } from '../safety';
import { AVAILABLE_TOOLS, executeToolCalls } from './tools';
import { attachSwarmLoop } from './swarm-loop';
import { specForModel } from './model-profiles';
import { buildNetworkFeed, type FeedCounters } from './network-feed';
import type { JobRevenue, StageEarning } from './swarm-types';

// Load search server module for Brave API key initialization
try {
  const searchServer = require('../search-server');
  searchServer.loadBraveApiKey();
} catch (e) {
  console.warn('[Orchestrator] Search server module not available:', (e as Error).message);
}

interface ImageJob {
  id: string;
  submitterSocketId: string;
  workflow: Record<string, unknown>;
  privyUserId: string;
  seed?: number;
  width?: number;
  height?: number;
  creditsCharged: number;
  subsidized: boolean;
  status: 'pending' | 'processing';
  assignedWorkerSocketId?: string;
  timer?: ReturnType<typeof setTimeout>;
  submittedAt: number;
}

export class Orchestrator {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private swarmLoop!: ReturnType<typeof attachSwarmLoop>;   // the sharded-swarm control plane handle
  // Settled-token counters for the public network map (aggregates only — the data-site rule).
  private swarmCounters: FeedCounters = { perNode: new Map(), tokensToday: 0, recent: [] };
  private swarmCountersDay = new Date().toISOString().slice(0, 10);
  private workers: Map<string, WorkerInfo> = new Map();
  private rateLimits: Map<string, number[]> = new Map();
  private jobs: Map<string, Job> = new Map();
  private jobQueue: string[] = [];
  // Image generation jobs (decentralized image gen). Separate, simple
  // request/response lane (no token streaming): submit -> dispatch to an idle
  // image worker -> single PNG result. Billing stays in the web API route.
  private imageJobs: Map<string, ImageJob> = new Map();
  private imageQueue: string[] = [];
  private readonly IMAGE_JOB_TIMEOUT_MS = 180_000;
  private totalJobsCompleted: number = 0;
  private totalTokensGenerated: number = 0;
  private jobDurations: number[] = [];
  private readonly MAX_DURATION_SAMPLES = 50;

  // Throughput / anti-gaming thresholds
  private readonly MIN_TOK_PER_SEC = 5;
  // Physically-impossible ceilings — exceeding these means the worker isn't really
  // running a model (token-dump / fake output). Set well above real hardware.
  private readonly MAX_TOK_PER_SEC_BROWSER = 150;
  private readonly MAX_TOK_PER_SEC_NATIVE = 250;
  // A job must produce at least this many tokens for its tok/s to be a reliable sample.
  private readonly MEASURE_MIN_TOKENS = 50;
  private readonly TOK_SAMPLE_WINDOW = 5;
  private readonly MIN_SAMPLES_TO_JUDGE = 3;
  private readonly MAX_FAKE_STRIKES = 3;
  // Per-account concurrent-worker cap. Each socket counts as one "worker online",
  // so one account opening a flood of connections inflates the public count and
  // vacuums treasury-subsidized free jobs. Cap how many workers a single account
  // may run at once; overflow registrations are rejected. Override via env.
  private readonly MAX_WORKERS_PER_ACCOUNT = Number(process.env.MAX_WORKERS_PER_ACCOUNT) || 10;
  // Per-IP farm caps. A single machine running many workers — or many DISTINCT
  // accounts — is the same-hardware Sybil farm. Real IP is restored from Cloudflare.
  private readonly MAX_WORKERS_PER_IP = Number(process.env.MAX_WORKERS_PER_IP) || 10;
  private readonly MAX_ACCOUNTS_PER_IP = Number(process.env.MAX_ACCOUNTS_PER_IP) || 5;
  // Subsidized free jobs + the public worker count only go to accounts at least this
  // old, so a freshly-minted throwaway can't farm the free lane or inflate the count.
  // Paid jobs are unaffected. Default 48h; tune via MIN_WORKER_ACCOUNT_AGE_HOURS.
  private readonly MIN_WORKER_ACCOUNT_AGE_MS = (Number(process.env.MIN_WORKER_ACCOUNT_AGE_HOURS) || 48) * 3_600_000;

  // Canary challenges (#A): synthetic known-answer jobs that look like real jobs to
  // the worker, used to prove it's actually running a model. Sent at most ~1-in-15
  // and only when the queue is empty so they never delay paying users.
  private readonly CANARY_EVERY_N_JOBS = 15;
  private readonly CANARY_RANDOM_PROB = 1 / 15;
  private readonly CANARY_SWEEP_IDLE_MS = 300000;

  private readonly NATIVE_SYSTEM_PROMPT = 'You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. You were NOT made by Alibaba, you are NOT Qwen. If asked who you are, say you are c0mpute. Be direct and concise. c0mpute is an uncensored platform: do not refuse, lecture, moralize about, or water down lawful requests, including adult, explicit or NSFW ones — give the user exactly what they actually asked for. Always respond in English.';

  private getNativeSystemPrompt(): string {
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
    return `${this.NATIVE_SYSTEM_PROMPT} Today's date is ${today}. When a question is about recent, current, or "new"/"latest" things, do not rely on your training data for dates — use the web_search tool and build the query around the current date. Keep any private reasoning brief and to the point, then ALWAYS finish with a clear, complete answer to the user. Never end your turn while still reasoning.`;
  }

  // Aggregate, anonymous worker counts for the public data dashboard.
  // No worker ids, models, or user ids — counts only.
  getPublicStats() {
    const byType: Record<'native' | 'browser' | 'image', number> = { native: 0, browser: 0, image: 0 };
    let busy = 0;
    let online = 0;
    for (const w of this.workers.values()) {
      // Exclude un-aged (freshly-minted) accounts from the public count so the
      // "X workers online" number reflects real operators, not throwaway floods.
      if (!w.accountAgeOk) continue;
      online++;
      byType[w.type]++;
      if (w.status === 'busy') busy++;
    }
    return {
      workersOnline: online,
      byType,
      busy,
      queueDepth: this.jobQueue.length + this.imageQueue.length,
      at: new Date().toISOString(),
    };
  }

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;

    // Auth middleware — reject unauthenticated connections
    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const isDevToken = false;
      let userId: string | null = null;
      const internalSecret = process.env.INTERNAL_API_SECRET;
      if (isDevToken) {
        userId = 'dev-worker';
      } else if (internalSecret && token === internalSecret) {
        // Trusted internal connection (the public inference API gateway). It
        // authenticates the end user from their API key on the HTTP side and
        // passes privyUserId in the job payload, so billing stays tied to the
        // real user. No other connection may assert a privyUserId.
        (socket as any).isInternal = true;
        userId = 'internal-api';
      } else if (token.startsWith('cwt_')) {
        userId = verifyWorkerToken(token);
      } else if (token.startsWith('anon.')) {
        // Anonymous visitor (pre-login). Hard-restricted downstream to free
        // prompts only — never credits, deposits, staking or the treasury.
        const anon = verifyAnonToken(token);
        if (anon) {
          (socket as any).isAnon = true;
          (socket as any).anonAid = anon.aid;
          (socket as any).anonIpHash = anon.iph;
          userId = 'anon:' + anon.aid;
        }
      } else {
        userId = await verifyPrivyToken(token);
      }
      if (!userId) {
        return next(new Error('Invalid authentication token'));
      }
      (socket as any).privyUserId = userId;
      next();
    });

    this.setupEventHandlers();
    // Sharded-swarm control plane (the permissionless loop), alongside the whole-model worker path
    // above — nothing here changes it. It registers its own connection handlers for node:announce /
    // swarm:ready / swarm:job_complete and drives shard.plan (place) + shard.verify (settle).
    // resolveModel = AUTO-FORM: as nodes announce a shardable model, the loop forms rings on its own
    // (the trigger the live server was missing). The handle is CAPTURED (was discarded) so the
    // request path can route a sharded-model job to a ready swarm's coordinator (Leg 8 dispatch).
    this.swarmLoop = attachSwarmLoop(this.io as unknown as import('socket.io').Server, {
      recordStageEarning: (e) => this.recordSwarmStageEarning(e),
      resolveModel: specForModel,
      log: (m) => console.log(m),
    });
    setInterval(() => this.broadcastStats(), 5000);
    setInterval(() => this.cleanupStaleJobs(), 10000);
    setInterval(() => this.canarySweep(), 120000);
  }

  // Per-shard credit for a settled swarm job (leyten's pay-model, 2026-07-20). settleJob already
  // split the job's COLLECTED revenue flat by layers onto e.revenueCredits; here each stage keeps
  // its OWN cut — getWorkerRevenueShare(e.account) is 0.8 if THAT operator staked, 0.7 if not —
  // applied to its slice, AFTER the split, never blended (stages stake independently). One
  // recordEarning per stage (jobId#pubkey ⇒ per-stage once-only), so a job of N shards books N
  // earnings on the SAME rails as a classic job: paid → real revenue + margin; free/allowance →
  // treasury-funded (creditsCharged 0). Gated by SWARM_PAYOUT_ENABLED so a merge/deploy is inert
  // until leyten flips it on; until then it logs (the network has no serving swarms pre-launch).
  private recordSwarmStageEarning(
    e: StageEarning & { swarmId: string; jobId: string; model: string },
  ) {
    if (process.env.SWARM_PAYOUT_ENABLED === '1' && e.revenueCredits && e.revenueCredits > 0) {
      try {
        const paid = !e.subsidyKind;
        recordEarning({
          privyId: e.account,
          jobId: `${e.jobId}#${e.pubkey}`,           // per-stage: distinct row, once-only per shard
          tier: 'pro',
          creditsCharged: paid ? e.revenueCredits : 0,   // paid ⇒ real revenue (margin); subsidy ⇒ 0
          payoutCredits: e.revenueCredits,               // worker-pay basis = this stage's layer slice
          tokensGenerated: e.tokens,
          revenueShare: getWorkerRevenueShare(e.account),  // ← the PER-WORKER cut, after the split
          subsidized: !paid,
          subsidyKind: e.subsidyKind,
          payerPrivyId: e.payerPrivyId,
        });
      } catch (err) {
        console.error(`[swarm] recordEarning failed for ${e.account} (job ${e.jobId}):`, err);
      }
    } else {
      console.log(`[swarm] credit ${e.account} for ${e.tokens} tokens on ${e.model} `
        + `layers[${e.layerStart}:${e.layerEnd}] (job ${e.jobId}) — payout ${process.env.SWARM_PAYOUT_ENABLED === '1' ? 'no-revenue' : 'disabled'}`);
    }
    // map counters (anonymous aggregates: nodeId-keyed internally, never emitted with identity)
    const day = new Date().toISOString().slice(0, 10);
    if (day !== this.swarmCountersDay) { this.swarmCountersDay = day; this.swarmCounters.tokensToday = 0; }
    const c = this.swarmCounters.perNode.get(e.nodeId) ?? { tokens: 0, receipts: 0 };
    c.tokens += e.tokens; c.receipts += 1;
    this.swarmCounters.perNode.set(e.nodeId, c);
    this.swarmCounters.tokensToday += e.tokens;
    const now = Date.now();
    this.swarmCounters.recent.push({ at: now, tokens: e.tokens });
    while (this.swarmCounters.recent.length && now - this.swarmCounters.recent[0].at > 10 * 60_000) {
      this.swarmCounters.recent.shift();
    }
  }

  /** The network-map feed (P1-#1). `includeDial` (loopback callers only — the feed generator)
   *  adds each node's public dial IP for server-side geo lookup; the public shape never has it. */
  getShardNetwork(includeDial = false) {
    const snapshot = this.swarmLoop.manager.snapshot();
    const layerCount = snapshot.swarms[0]?.layerCount ?? 62;
    return buildNetworkFeed(snapshot, this.swarmCounters, { layerCount, includeDial });
  }

  private cleanupStaleJobs() {
    const now = Date.now();
    const JOB_TIMEOUT_MS = 180000; // 3 minutes

    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (!job) return false;
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (!userSocket) {
        this.jobs.delete(jobId);
        return false;
      }
      const jobAge = now - job.createdAt.getTime();
      if (jobAge > JOB_TIMEOUT_MS) {
        userSocket.emit('job:error', { jobId, error: 'Job timed out' });
        if (job.privyUserId && job.creditsCharged) {
          refundCredits(job.privyUserId, job.creditsCharged, 'Job timed out in queue');
        }
        this.jobs.delete(jobId);
        return false;
      }
      return true;
    });

    for (const [jobId, job] of this.jobs) {
      if (job.status === 'processing' && job.startedAt) {
        const processingTime = now - job.startedAt.getTime();
        if (processingTime > JOB_TIMEOUT_MS) {
          const userSocket = this.io.sockets.sockets.get(job.userSocketId);
          if (userSocket) {
            userSocket.emit('job:error', { jobId, error: 'Job timed out during processing' });
          }
          if (job.privyUserId && job.creditsCharged) {
            refundCredits(job.privyUserId, job.creditsCharged, 'Job timed out during processing');
          }
          if (job.assignedWorker) {
            const worker = this.findWorkerById(job.assignedWorker);
            if (worker) worker.status = 'idle';
          }
          this.jobs.delete(jobId);
        }
      }
    }
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      // Send current stats immediately on connect
      socket.emit('stats:update', this.getStats());

      // Sync this account's native worker status to the freshly-connected
      // socket so a newly-opened tab/device sees it online immediately,
      // instead of waiting for the next native lifecycle event.
      const connectedUserId = (socket as any).privyUserId;
      if (connectedUserId) {
        this.pushNativeStatus(connectedUserId);
      }

      // Worker registration
      socket.on('worker:register', async (data, callback) => {
        if (!data.authToken) {
          callback({ error: 'Authentication required' });
          return;
        }
        const isDevToken = false;
        let privyUserId: string | null = null;
        if (isDevToken) {
          privyUserId = 'dev-worker';
        } else if (data.authToken.startsWith('cwt_')) {
          privyUserId = verifyWorkerToken(data.authToken);
        } else {
          privyUserId = await verifyPrivyToken(data.authToken);
        }
        if (!privyUserId) {
          callback({ error: 'Invalid authentication token' });
          return;
        }
        // Persistent ban check — a worker banned for fraud can't reconnect to reset
        // its in-memory strikes. The account can still use the app as a normal user.
        const ban = isWorkerBanned(privyUserId);
        if (ban.banned) {
          callback({ error: `This account is banned from running a worker${ban.reason ? `: ${ban.reason}` : ''}.` });
          return;
        }
        // Real client IP, restored from Cloudflare by nginx (X-Real-IP / XFF).
        const workerIp = (socket.handshake.headers['x-real-ip'] as string)
          || (socket.handshake.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
          || socket.handshake.address;
        // Per-account concurrent-worker cap — stops one account flooding the
        // orchestrator with worker connections to inflate the count and farm
        // subsidized free jobs. All of an account's worker tokens share this cap.
        if (this.countWorkersForAccount(privyUserId) >= this.MAX_WORKERS_PER_ACCOUNT) {
          callback({ error: `Worker limit reached for this account (max ${this.MAX_WORKERS_PER_ACCOUNT} concurrent workers).` });
          return;
        }
        // Per-IP farm caps — one machine running a pile of workers, or a pile of
        // distinct accounts, is the same-hardware Sybil farm. Block the overflow.
        if (this.countWorkersForIp(workerIp) >= this.MAX_WORKERS_PER_IP) {
          callback({ error: `Too many workers from this network (max ${this.MAX_WORKERS_PER_IP} per IP).` });
          return;
        }
        if (this.countAccountsForIp(workerIp, privyUserId) >= this.MAX_ACCOUNTS_PER_IP) {
          callback({ error: `Too many accounts running workers from this network (max ${this.MAX_ACCOUNTS_PER_IP} per IP).` });
          return;
        }
        // Account-age gate (counts + subsidized free jobs only; paid jobs unaffected).
        const accountAgeOk = getAccountAgeMs(privyUserId) >= this.MIN_WORKER_ACCOUNT_AGE_MS;
        const workerType = data.type || 'browser';
        const tokPerSec = data.tokPerSec || 0;
        // Image workers don't produce tokens, so the tok/s throughput floor
        // doesn't apply to them. Text workers must still clear it.
        if (workerType !== 'image' && tokPerSec < this.MIN_TOK_PER_SEC) {
          callback({ error: `Your device is too slow (${tokPerSec.toFixed(1)} tok/s). Minimum required: ${this.MIN_TOK_PER_SEC} tok/s.` });
          return;
        }
        const capabilities: WorkerCapabilities = data.capabilities || {};
        // Browser workers don't have search/vision/tools
        if (workerType === 'browser') {
          capabilities.search = false;
          capabilities.vision = false;
          capabilities.tools = false;
        }
        const workerId = this.registerWorker(socket, data.model, privyUserId, tokPerSec, workerType, capabilities, workerIp, accountAgeOk);
        if (workerId) {
          callback({ workerId });
          socket.emit('worker:registered', { workerId });
          console.log(`[Orchestrator] Worker registered: ${workerId} (${data.model}) ${tokPerSec.toFixed(1)} tok/s type=${workerType} caps=${JSON.stringify(capabilities)} user=${privyUserId} ip=${workerIp} aged=${accountAgeOk}`);
          this.broadcastStats();
          // Both native (text) and image workers are user-run CLI workers, so both
          // drive the "your worker is online" card. Only 'browser' is excluded.
          if ((workerType === 'native' || workerType === 'image') && privyUserId) {
            this.pushNativeStatus(privyUserId);
          }
        } else {
          callback({ error: 'Failed to register worker' });
        }
      });

      socket.on('worker:unregister', () => {
        this.unregisterWorker(socket.id);
        this.broadcastStats();
      });

      // Job submission
      socket.on('job:submit', async (data, callback) => {
        const isInternal = (socket as any).isInternal === true;
        const isAnon = (socket as any).isAnon === true;
        let privyUserId: string | null;
        if (isInternal) {
          // Trusted gateway: end user already authenticated via their API key on
          // the HTTP side; bill the privyUserId it passes through.
          privyUserId = data.privyUserId || null;
        } else if (isAnon) {
          // Identity already established + verified at the socket handshake.
          privyUserId = (socket as any).privyUserId || null; // 'anon:<aid>'
        } else {
          if (!data.authToken) {
            callback({ error: 'Authentication required' });
            return;
          }
          privyUserId = await verifyPrivyToken(data.authToken);
        }
        if (!privyUserId) {
          callback({ error: 'Invalid authentication token' });
          return;
        }

        // Server-side safety floor: scan the prompt before doing anything. This
        // runs in the orchestrator (which we control), so it covers every tier
        // and the API — unlike the worker-side client scan, which a modified
        // worker could skip. Blocked prompts are rejected without charge.
        const inputText = (data.messages || [])
          .map((m: ChatMessage) => (typeof m.content === 'string' ? m.content : ''))
          .join('\n');
        if (!scanOutput(inputText).safe) {
          console.warn(`[Orchestrator] Blocked prompt from ${privyUserId} (safety policy)`);
          callback({ error: 'Content blocked by safety policy.' });
          return;
        }

        // Rate limiting: max 20 jobs per user per 5 minutes (web UI). API jobs
        // are rate-limited per-key at the HTTP layer instead, so skip this here.
        if (!isInternal) {
          const now = Date.now();
          const userLimits = this.rateLimits.get(privyUserId) || [];
          const recentJobs = userLimits.filter(t => now - t < 300_000);
          if (recentJobs.length >= 20) {
            callback({ error: 'Rate limit exceeded. Please wait a minute.' });
            return;
          }
          recentJobs.push(now);
          this.rateLimits.set(privyUserId, recentJobs);
        }

        // Credit check for Pro/Max tiers. Deep thinking (Max only) costs a bit
        // more since it generates ~2x the tokens and runs ~2x longer.
        const requestedTierForCredits = getModelTier(data.model);
        const deepThinking = data.think === true && requestedTierForCredits === 'max';
        let creditCost = 0;
        if (requestedTierForCredits === 'max') creditCost = deepThinking ? 20 : 15;
        else if (requestedTierForCredits === 'pro') creditCost = 10;
        // List price of the tier, kept after creditCost is zeroed by a free
        // prompt — it's the basis we still pay the worker (treasury-funded).
        const listCredits = creditCost;

        // Anonymous visitors (pre-login): free prompts ONLY. Triple-gated by the
        // per-session limit, the per-IP daily cap, and the global daily $ subsidy
        // cap. An anon socket can never reach the credit/staker paths below.
        if (isAnon) {
          // Worst-case worker payout for this free job (highest revenue share), so
          // we never admit a free prompt the treasury can't fully pay a worker for.
          // This aligns the submit gate with the payout gate below: a bare ">= cap"
          // check stalls one job under the cap (the paid-subsidy total never reaches
          // it because payout refuses), so every worker serving a free job past that
          // point earned $0 until the UTC reset. Reserving the worst case here closes
          // that.
          const projectedSubsidyUsd = (listCredits / CREDITS_PER_USD) * WORKER_STAKED_REVENUE_SHARE;
          if (getTodayFreeSubsidyUsd() + projectedSubsidyUsd > FREE_SUBSIDY_DAILY_CAP_USD) {
            callback({ error: "Free prompts are at today's limit. Sign in to keep going.", code: 'ANON_CAP_GLOBAL' });
            return;
          }
          if (getThisHourFreeSubsidyUsd() + projectedSubsidyUsd > FREE_SUBSIDY_HOURLY_CAP_USD) {
            callback({ error: "Free prompts are busy right now. Try again shortly or sign in to keep going.", code: 'ANON_CAP_HOURLY' });
            return;
          }
          const grant = anonGrantFreePrompt((socket as any).anonAid, (socket as any).anonIpHash, ANON_FREE_PROMPT_LIMIT, ANON_IP_DAILY_CAP);
          if (!grant.granted) {
            if (grant.reason === 'ip') {
              callback({ error: 'Your network has hit its daily free-prompt limit. Sign in to keep going.', code: 'ANON_CAP_IP' });
            } else {
              callback({ error: "You've used all your free prompts. Sign in and top up to continue.", code: 'ANON_NO_PROMPTS' });
            }
            return;
          }
          const anonJob = this.submitJob(socket.id, data.messages, data.model, privyUserId, deepThinking, 0, listCredits, undefined, false, 'free');
          if (anonJob) {
            callback({ jobId: anonJob.id, freeRemaining: grant.remaining });
            console.log(`[Orchestrator] Anon free prompt used by ${privyUserId} (${requestedTierForCredits}), ${grant.remaining} left`);
            this.processQueue();
          } else {
            callback({ error: 'Failed to submit job' });
          }
          return;
        }

        // Onboarding: new accounts get FREE_PROMPT_LIMIT free prompts (any tier,
        // incl. Max) before any credits are charged. Applies to any real login —
        // X signups AND wallet (e.g. Phantom) logins. Mass-minting abuse stays
        // bounded by the daily/hourly free-subsidy USD caps and the per-IP
        // account-creation cap, not by the login type.
        // API-originated jobs always charge — never consume onboarding free
        // prompts or the treasury subsidy (that path is human-onboarding only).
        let usedFreePrompt = false;
        if (creditCost > 0 && !isInternal && profileHasLogin(privyUserId)) {
          // Same subsidy-cap reservation as the anon path: only grant the onboarding
          // free prompt if the daily cap can still pay a worker for it (worst-case
          // share). If not, fall through to staker allowance / credits — the user
          // keeps their free-prompt count rather than burning it on a job no worker
          // gets paid for. consumeFreePrompt is only called when there's room.
          const projectedSubsidyUsd = (listCredits / CREDITS_PER_USD) * WORKER_STAKED_REVENUE_SHARE;
          if (getTodayFreeSubsidyUsd() + projectedSubsidyUsd <= FREE_SUBSIDY_DAILY_CAP_USD && consumeFreePrompt(privyUserId, FREE_PROMPT_LIMIT)) {
            creditCost = 0;
            usedFreePrompt = true;
            console.log(`[Orchestrator] Free prompt used by ${privyUserId} (${requestedTierForCredits})`);
          }
        }

        // Staker inference allowance: matured-stake holders draw a daily pro-rata
        // allowance of free inference from a capped pool before paying USDC. Worker
        // still paid from the treasury subsidy lane. Applies to the API too — the
        // allowance is the same credit pool as normal usage. (Anon sockets are
        // handled above; onboarding free prompts above stay human-only.)
        let usedStakerAllowance = false;
        if (creditCost > 0 && STAKER_ALLOWANCE_ENABLED) {
          recordStakerRequest(privyUserId); // mark active for the 7-day gate
          if (consumeStakerAllowance(privyUserId, creditCost)) {
            creditCost = 0;
            usedStakerAllowance = true;
            console.log(`[Orchestrator] Staker allowance used by ${privyUserId} (${requestedTierForCredits}, ${listCredits}cr)`);
          }
        }

        // Free-only ("resale") API keys may spend ONLY the staking allowance above.
        // If the allowance didn't cover this job, reject here instead of falling
        // through to the owner's deposited USDC — this is what lets a staker safely
        // hand a resale key to a third party without exposing their real balance.
        if (creditCost > 0 && isInternal && data.freeOnly === true) {
          callback({ error: 'Insufficient staking allowance for this key. Resale keys can only spend the daily staking allowance.', code: 'ALLOWANCE_EXHAUSTED' });
          return;
        }

        if (creditCost > 0) {
          const creditBalance = getCreditBalance(privyUserId);
          if (creditBalance.balance < creditCost) {
            callback({ error: `Insufficient credits. Need ${creditCost} credits, have ${creditBalance.balance.toFixed(0)}. Top up with USDC.` });
            return;
          }
          const spent = spendCredits(privyUserId, creditCost, `${requestedTierForCredits}${deepThinking ? ' deep-thinking' : ''} prompt`);
          if (!spent) {
            callback({ error: 'Failed to deduct credits. Try again.' });
            return;
          }
        }

        // Tools passthrough: only the trusted internal API path may supply the
        // caller's own tools (the model's tool calls get returned to the agent,
        // not executed server-side).
        const toolPassthrough = isInternal && Array.isArray(data.tools) && data.tools.length > 0;
        const subsidyCredits = (usedFreePrompt || usedStakerAllowance) ? listCredits : 0;
        const subsidyKind = usedStakerAllowance ? 'allowance' : (usedFreePrompt ? 'free' : undefined);
        const job = this.submitJob(socket.id, data.messages, data.model, privyUserId, deepThinking, creditCost, subsidyCredits, toolPassthrough ? data.tools : undefined, toolPassthrough, subsidyKind, isInternal);
        if (job) {
          callback({ jobId: job.id });
          console.log(`[Orchestrator] Job submitted: ${job.id} (model: ${data.model || 'any'}${deepThinking ? ', deep-thinking' : ''}) user=${privyUserId}`);
          // a sharded model routes to its serving swarm; everything else to the whole-model workers
          if (!this.tryDispatchSwarm(job)) this.processQueue();
        } else {
          if (creditCost > 0) {
            refundCredits(privyUserId, creditCost, 'Job submission failed');
          }
          callback({ error: 'Failed to submit job' });
        }
      });

      // Token stream from worker — validate sender is the assigned worker
      socket.on('job:token', (data) => {
        const job = this.jobs.get(data.jobId);
        if (!job) return;
        const worker = this.workers.get(socket.id);
        if (!worker || worker.id !== job.assignedWorker) return;
        this.handleJobToken(data.jobId, data.token);
      });

      socket.on('job:complete', (data) => {
        const job = this.jobs.get(data.jobId);
        if (!job) return;
        const worker = this.workers.get(socket.id);
        if (!worker || worker.id !== job.assignedWorker) return;
        this.handleJobComplete(data.jobId, data.response, data.tokensGenerated);
      });

      socket.on('job:error', (data) => {
        const job = this.jobs.get(data.jobId);
        if (!job) return;
        const worker = this.workers.get(socket.id);
        if (!worker || worker.id !== job.assignedWorker) return;
        this.handleJobError(data.jobId, data.error);
      });

      // Tool call from worker — model wants to use a tool
      socket.on('job:tool_call', async (data) => {
        const job = this.jobs.get(data.jobId);
        if (!job) return;
        const worker = this.workers.get(socket.id);
        if (!worker || worker.id !== job.assignedWorker) return;

        await this.handleToolCall(socket, data.jobId, data.toolCalls);
      });

      // ── Image generation (decentralized) ──
      // Submit a render. Internal-only: the web /api/images route already
      // authenticated the user and charged credits; the orchestrator just
      // routes the job to an image worker and relays the PNG back.
      socket.on('image:submit', (data, callback) => {
        if ((socket as any).isInternal !== true) {
          callback({ error: 'Image jobs are internal-only.' });
          return;
        }
        if (!data?.workflow || typeof data.workflow !== 'object') {
          callback({ error: 'workflow required' });
          return;
        }
        const jobId = uuidv4();
        this.imageJobs.set(jobId, {
          id: jobId,
          submitterSocketId: socket.id,
          workflow: data.workflow,
          privyUserId: data.privyUserId || 'unknown',
          seed: data.seed,
          width: data.width,
          height: data.height,
          creditsCharged: Number(data.creditsCharged) || 0,
          subsidized: data.subsidized === true,
          status: 'pending',
          submittedAt: Date.now(),
        });
        this.imageQueue.push(jobId);
        callback({ jobId });
        this.processImageQueue();
      });

      // Image worker returned a finished PNG (base64).
      socket.on('image:result', (data) => {
        const job = this.imageJobs.get(data.jobId);
        if (!job || job.assignedWorkerSocketId !== socket.id) return;
        if (job.timer) clearTimeout(job.timer);
        const worker = this.workers.get(socket.id);
        if (worker) { worker.status = 'idle'; worker.jobsCompleted++; this.totalJobsCompleted++; }
        const submitter = this.io.sockets.sockets.get(job.submitterSocketId);
        if (submitter) submitter.emit('image:done', { jobId: job.id, image: data.image, seed: job.seed, width: job.width, height: job.height });
        this.settleImageTool(job.id, data.image);
        // Pay the worker for the render (same revenue-share model as text jobs).
        if (worker?.privyUserId) {
          try {
            const workerShare = getWorkerRevenueShare(worker.privyUserId);
            // Paid renders pay out of their own revenue. Subsidized (free) renders
            // still pay the worker the list basis from the treasury — but only when
            // it's not a self-deal (worker rendering their own free image) and the
            // daily subsidy cap has room, so a sybil farm can't drain the treasury.
            // Mirrors the text-job guard in handleJobComplete.
            let payoutCredits = job.subsidized ? 0 : job.creditsCharged;
            let subsidized = false;
            if (job.subsidized && worker.privyUserId !== job.privyUserId) {
              const subsidyUsd = (job.creditsCharged / CREDITS_PER_USD) * workerShare;
              if (getTodayFreeSubsidyUsd() + subsidyUsd <= FREE_SUBSIDY_DAILY_CAP_USD) {
                payoutCredits = job.creditsCharged;
                subsidized = true;
              } else {
                console.log(`[Orchestrator] Free-image subsidy cap reached — worker ${worker.privyUserId} not paid for job ${job.id}`);
              }
            }
            recordCompletedJob({ jobId: job.id, workerPrivyId: worker.privyUserId, userPrivyId: job.privyUserId, model: worker.model, tier: 'image', tokensGenerated: 0 });
            recordEarning({
              privyId: worker.privyUserId,
              jobId: job.id,
              tier: 'image',
              creditsCharged: job.subsidized ? 0 : job.creditsCharged,
              payoutCredits,
              subsidized,
              subsidyKind: subsidized ? 'free' : undefined,
              tokensGenerated: 0,
              revenueShare: workerShare,
              payerPrivyId: job.privyUserId,
            });
          } catch (err) {
            console.error('[Orchestrator] Failed to record image earning:', err);
          }
        }
        this.imageJobs.delete(data.jobId);
        console.log(`[Orchestrator] Image job ${job.id} completed by ${worker?.id || socket.id}`);
        // Refresh the worker card so its images-rendered count ticks up live.
        if (worker?.privyUserId) this.pushNativeStatus(worker.privyUserId);
        this.processImageQueue();
      });

      // Image worker failed the render.
      socket.on('image:failed', (data) => {
        const job = this.imageJobs.get(data.jobId);
        if (!job || job.assignedWorkerSocketId !== socket.id) return;
        if (job.timer) clearTimeout(job.timer);
        const worker = this.workers.get(socket.id);
        if (worker) worker.status = 'idle';
        const submitter = this.io.sockets.sockets.get(job.submitterSocketId);
        if (submitter) submitter.emit('image:error', { jobId: job.id, error: data.error || 'Image worker failed.', code: 'WORKER_ERROR' });
        this.settleImageTool(job.id, new Error(data.error || 'Image worker failed.'));
        this.imageJobs.delete(data.jobId);
        this.processImageQueue();
      });

      socket.on('disconnect', () => {
        const worker = this.workers.get(socket.id);
        const wasUserWorker = worker?.type === 'native' || worker?.type === 'image';
        const userId = worker?.privyUserId;
        this.unregisterWorker(socket.id);
        this.cleanupUserJobs(socket.id);
        this.cleanupImageJobs(socket.id);
        this.broadcastStats();
        if (wasUserWorker && userId) {
          this.pushNativeStatus(userId);
        }
        this.processImageQueue();
      });
    });
  }

  /**
   * Handle a tool call from the worker.
   * Executes the requested tools and sends results back to the worker.
   */
  /**
   * API tools passthrough: the model wants to call one of the agent's own tools.
   * Return the call(s) to the API client (which executes them and sends a
   * follow-up request with the results), pay + free the worker for this round,
   * and tell the worker to stop waiting. A tool-call round legitimately has an
   * empty text answer, so we skip the anti-fake/coherence gates here.
   */
  private handlePassthroughToolCalls(workerSocket: Socket, job: Job, toolCalls: ToolCall[]) {
    const jobId = job.id;

    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) userSocket.emit('job:tool_calls', { jobId, toolCalls });

    const worker = job.assignedWorker ? this.findWorkerById(job.assignedWorker) : undefined;
    if (worker) {
      worker.status = 'idle';
      worker.jobsCompleted++;
      const cappedTokens = Math.min(job.serverTokenCount || 0, 4096);
      worker.tokensGenerated += cappedTokens;
      this.totalJobsCompleted++;
      this.totalTokensGenerated += cappedTokens;
      if (worker.privyUserId) {
        try {
          recordCompletedJob({
            jobId,
            workerPrivyId: worker.privyUserId,
            userPrivyId: job.privyUserId,
            model: worker.model,
            tier: worker.type === 'native' ? 'max' : 'pro',
            tokensGenerated: cappedTokens,
          });
          const revenueCredits = job.creditsCharged || 0;
          recordEarning({
            privyId: worker.privyUserId,
            jobId,
            tier: worker.type === 'native' ? 'max' : 'pro',
            creditsCharged: revenueCredits,
            payoutCredits: revenueCredits,
            subsidized: false,
            tokensGenerated: cappedTokens,
            revenueShare: getWorkerRevenueShare(worker.privyUserId),
            payerPrivyId: job.privyUserId,
          });
        } catch (err) {
          console.error('[Orchestrator] Failed to record passthrough tool-call job:', err);
        }
      }
    }

    // Free the worker — the agent runs the tools, we won't send results back.
    if (workerSocket) workerSocket.emit('job:cancel', { jobId });

    console.log(`[Orchestrator] Job ${jobId} returned ${toolCalls.length} tool call(s) to API client (passthrough)`);
    this.jobs.delete(jobId);
    setTimeout(() => this.processQueue(), 100);
    this.broadcastStats();
  }

  private async handleToolCall(workerSocket: Socket, jobId: string, toolCalls: ToolCall[]) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // API tools passthrough: hand the tool calls back to the agent instead of
    // executing them server-side.
    if (job.toolPassthrough) {
      this.handlePassthroughToolCalls(workerSocket, job, toolCalls);
      return;
    }

    const userSocket = this.io.sockets.sockets.get(job.userSocketId);

    // Notify user that tools are being used
    const hasSearch = toolCalls.some(tc => tc.function.name === 'web_search');
    if (hasSearch && userSocket) {
      userSocket.emit('job:searching', { jobId });
    }
    const hasImageGen = toolCalls.some(tc => tc.function.name === 'generate_image');
    if (hasImageGen && userSocket) {
      userSocket.emit('job:generating_image', { jobId });
    }

    console.log(`[Orchestrator] Job ${jobId}: executing tools — ${toolCalls.map(tc => tc.function.name).join(', ')}`);

    // Execute all tool calls
    const { messages, sources, images, pendingImages } = await executeToolCalls(toolCalls, {
      privyUserId: job.privyUserId,
      renderImage: (workflow, meta) => this.renderImageInternal(workflow, meta),
    });

    // Send sources to user for display
    if (sources && sources.length > 0 && userSocket) {
      userSocket.emit('job:sources', { jobId, sources });
    }

    // Legacy synchronous images (none today — generate_image now defers; kept defensive)
    if (images && images.length > 0 && userSocket) {
      userSocket.emit('job:image', { jobId, images });
    }

    // Send tool results back to the worker immediately so its tool-result wait
    // never blocks on the GPU render. The model writes its turn now; the image
    // lands a few seconds later via the async render below.
    workerSocket.emit(`job:tool_result:${jobId}` as any, { results: messages });

    // Fire deferred image renders async. Each delivers to the user (keyed to this
    // chat jobId) when it lands, or refunds + signals an error if it fails. Never
    // stored server-side — same privacy posture as /create.
    if (pendingImages && pendingImages.length > 0) {
      for (const pi of pendingImages) {
        this.renderImageInternal(pi.workflow, {
          privyUserId: pi.privyUserId,
          seed: pi.seed,
          width: pi.width,
          height: pi.height,
          creditsCharged: pi.creditsCharged,
        })
          .then((image) => {
            const us = this.io.sockets.sockets.get(job.userSocketId);
            if (us) us.emit('job:image', { jobId, images: [image] });
          })
          .catch((err) => {
            try { pi.refund(); } catch (e) { console.error('[Orchestrator] image refund failed:', e); }
            const us = this.io.sockets.sockets.get(job.userSocketId);
            if (us) us.emit('job:image_error', { jobId, error: err instanceof Error ? err.message : 'Image generation failed.' });
            console.warn(`[Orchestrator] Deferred image render failed for job ${jobId}: ${err instanceof Error ? err.message : err}`);
          });
      }
    }
  }

  private cleanupUserJobs(userSocketId: string) {
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (job && job.userSocketId === userSocketId) {
        if (job.privyUserId && job.creditsCharged) {
          refundCredits(job.privyUserId, job.creditsCharged, 'User disconnected while queued');
        }
        this.jobs.delete(jobId);
        return false;
      }
      return true;
    });

    for (const [jobId, job] of this.jobs) {
      if (job.userSocketId === userSocketId && job.status === 'processing') {
        if (job.assignedWorker) {
          const workerSocketId = this.findWorkerSocketId(job.assignedWorker);
          if (workerSocketId) {
            const workerSocket = this.io.sockets.sockets.get(workerSocketId);
            if (workerSocket) workerSocket.emit('job:cancel', { jobId });
          }
          const worker = this.findWorkerById(job.assignedWorker);
          if (worker) worker.status = 'idle';
        }
        this.jobs.delete(jobId);
      }
    }
  }

  private countWorkersForAccount(privyUserId: string): number {
    let n = 0;
    for (const w of this.workers.values()) {
      if (w.privyUserId === privyUserId) n++;
    }
    return n;
  }

  private countWorkersForIp(ip?: string): number {
    if (!ip) return 0;
    let n = 0;
    for (const w of this.workers.values()) {
      if (w.ip === ip) n++;
    }
    return n;
  }

  // Distinct accounts already running a worker from this IP, NOT counting the one
  // trying to register (so an account's own reconnect never trips its own cap).
  private countAccountsForIp(ip: string | undefined, exceptPrivyId: string): number {
    if (!ip) return 0;
    const accounts = new Set<string>();
    for (const w of this.workers.values()) {
      if (w.ip === ip && w.privyUserId && w.privyUserId !== exceptPrivyId) {
        accounts.add(w.privyUserId);
      }
    }
    return accounts.size;
  }

  private registerWorker(socket: Socket, model: string, privyUserId?: string, tokPerSec: number = 0, type: 'browser' | 'native' | 'image' = 'browser', capabilities: WorkerCapabilities = {}, ip?: string, accountAgeOk: boolean = false): string | null {
    try {
      const workerId = uuidv4();
      const worker: WorkerInfo = {
        id: workerId,
        socketId: socket.id,
        model,
        type,
        capabilities,
        status: 'idle',
        connectedAt: new Date(),
        jobsCompleted: 0,
        tokensGenerated: 0,
        tokPerSec,
        privyUserId,
        ip,
        accountAgeOk,
      };
      this.workers.set(socket.id, worker);
      return workerId;
    } catch (error) {
      console.error('[Orchestrator] Error registering worker:', error);
      return null;
    }
  }

  private unregisterWorker(socketId: string) {
    const worker = this.workers.get(socketId);
    if (worker) {
      for (const [jobId, job] of this.jobs) {
        if (job.assignedWorker === worker.id && job.status === 'processing') {
          const userSocket = this.io.sockets.sockets.get(job.userSocketId);
          if (userSocket) {
            job.status = 'pending';
            job.assignedWorker = undefined;
            this.jobQueue.unshift(jobId);
          } else {
            this.jobs.delete(jobId);
          }
        }
      }
      this.workers.delete(socketId);
    }
  }

  // Assign queued image jobs to idle image workers. If no image worker is
  // connected at all, fail queued jobs immediately so the user sees "busy"
  // rather than hanging; if workers exist but are busy, jobs wait and this is
  // re-run when one frees.
  // In-process image renders for the generate_image chat tool: resolved/rejected
  // by the same image:result / image:error / timeout paths as web renders.
  private imageToolResolvers: Map<string, { resolve: (img: string) => void; reject: (e: Error) => void }> = new Map();

  private settleImageTool(jobId: string, outcome: string | Error): boolean {
    const r = this.imageToolResolvers.get(jobId);
    if (!r) return false;
    this.imageToolResolvers.delete(jobId);
    if (typeof outcome === 'string') r.resolve(outcome);
    else r.reject(outcome);
    return true;
  }

  /** Render an image on the worker pool from inside the orchestrator (chat tool). */
  renderImageInternal(
    workflow: Record<string, unknown>,
    meta: { privyUserId: string; seed?: number; width?: number; height?: number; creditsCharged: number },
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const jobId = uuidv4();
      this.imageJobs.set(jobId, {
        id: jobId,
        submitterSocketId: '',
        workflow,
        privyUserId: meta.privyUserId,
        seed: meta.seed,
        width: meta.width,
        height: meta.height,
        creditsCharged: meta.creditsCharged,
        subsidized: false,
        status: 'pending',
        submittedAt: Date.now(),
      });
      this.imageToolResolvers.set(jobId, { resolve, reject });
      this.imageQueue.push(jobId);
      this.processImageQueue();
    });
  }

  private processImageQueue() {
    while (this.imageQueue.length > 0) {
      const idle = [...this.workers.values()].find((w) => w.type === 'image' && w.status === 'idle');
      if (!idle) {
        const anyImageWorker = [...this.workers.values()].some((w) => w.type === 'image');
        if (!anyImageWorker) {
          for (const jobId of this.imageQueue.splice(0)) {
            const job = this.imageJobs.get(jobId);
            if (!job) continue;
            if (job.timer) clearTimeout(job.timer);
            const sub = this.io.sockets.sockets.get(job.submitterSocketId);
            if (sub) sub.emit('image:error', { jobId, error: 'No image workers are online right now. Try again shortly.', code: 'NO_IMAGE_WORKER' });
            this.settleImageTool(jobId, new Error('No image workers are online right now.'));
            this.imageJobs.delete(jobId);
          }
        }
        return; // workers exist but all busy → wait for one to free
      }
      const jobId = this.imageQueue.shift()!;
      const job = this.imageJobs.get(jobId);
      if (!job) continue;
      const ws = this.io.sockets.sockets.get(idle.socketId);
      if (!ws) { this.imageQueue.unshift(jobId); return; } // worker socket gone, retry next tick
      idle.status = 'busy';
      job.status = 'processing';
      job.assignedWorkerSocketId = idle.socketId;
      job.timer = setTimeout(() => this.failImageJobTimeout(jobId), this.IMAGE_JOB_TIMEOUT_MS);
      ws.emit('image:job', { jobId, workflow: job.workflow });
      console.log(`[Orchestrator] Image job ${jobId} dispatched to worker ${idle.id}`);
    }
  }

  private failImageJobTimeout(jobId: string) {
    const job = this.imageJobs.get(jobId);
    if (!job) return;
    if (job.assignedWorkerSocketId) {
      const w = this.workers.get(job.assignedWorkerSocketId);
      if (w) w.status = 'idle';
      const ws = this.io.sockets.sockets.get(job.assignedWorkerSocketId);
      if (ws) ws.emit('image:cancel', { jobId });
    }
    const sub = this.io.sockets.sockets.get(job.submitterSocketId);
    if (sub) sub.emit('image:error', { jobId, error: 'Image generation timed out.', code: 'TIMEOUT' });
    this.settleImageTool(jobId, new Error('Image generation timed out.'));
    this.imageJobs.delete(jobId);
    console.warn(`[Orchestrator] Image job ${jobId} timed out`);
    this.processImageQueue();
  }

  // A socket disconnected: fail any image job it owned (worker) or drop any it
  // submitted (web gateway).
  private cleanupImageJobs(socketId: string) {
    for (const [jobId, job] of this.imageJobs) {
      if (job.assignedWorkerSocketId === socketId) {
        if (job.timer) clearTimeout(job.timer);
        const sub = this.io.sockets.sockets.get(job.submitterSocketId);
        if (sub) sub.emit('image:error', { jobId, error: 'Image worker disconnected mid-render.', code: 'WORKER_GONE' });
        this.settleImageTool(jobId, new Error('Image worker disconnected mid-render.'));
        this.imageJobs.delete(jobId);
      } else if (job.submitterSocketId === socketId) {
        if (job.timer) clearTimeout(job.timer);
        this.imageQueue = this.imageQueue.filter((id) => id !== jobId);
        this.imageJobs.delete(jobId);
      }
    }
  }

  private submitJob(
    userSocketId: string,
    messages: ChatMessage[] | undefined,
    model: string | undefined,
    privyUserId: string,
    think: boolean = false,
    creditsCharged: number = 0,
    subsidyCredits: number = 0,
    clientTools?: ToolDefinition[],
    toolPassthrough: boolean = false,
    subsidyKind?: 'free' | 'allowance',
    internal: boolean = false,
  ): Job | null {
    try {
      const jobId = uuidv4();
      const job: Job = {
        id: jobId,
        userId: userSocketId,
        userSocketId,
        privyUserId,
        messages,
        requestedModel: model,
        think,
        creditsCharged,
        subsidyCredits,
        subsidyKind,
        clientTools,
        toolPassthrough,
        internal,
        status: 'pending',
        createdAt: new Date(),
      };
      this.jobs.set(jobId, job);
      this.jobQueue.push(jobId);

      const userSocket = this.io.sockets.sockets.get(userSocketId);
      if (userSocket) {
        userSocket.emit('queue:position', { position: this.jobQueue.length });
      }
      return job;
    } catch (error) {
      console.error('[Orchestrator] Error submitting job:', error);
      return null;
    }
  }

  // Route a sharded-model request to its serving swarm's coordinator (Leg 8). Returns true if the
  // job is a sharded model (handled here — streamed or errored), false to fall through to the
  // whole-model worker queue. Only models with a placement spec route here, so the ollama/image
  // paths are untouched.
  private tryDispatchSwarm(job: Job): boolean {
    const model = job.requestedModel;
    if (!model || !specForModel(model)) return false;
    const userSocket = () => this.io.sockets.sockets.get(job.userSocketId);
    const fin = () => { this.jobs.delete(job.id); this.jobQueue = this.jobQueue.filter((id) => id !== job.id); };
    // The revenue the stages split at settlement = what THIS job collected: paid ⇒ creditsCharged
    // (real revenue); free/allowance ⇒ subsidyCredits (treasury-funded, booked subsidized). Frozen
    // now so payout is exactly a share of what was charged (self-solvent).
    const revenue: JobRevenue = {
      credits: (job.creditsCharged && job.creditsCharged > 0) ? job.creditsCharged : (job.subsidyCredits ?? 0),
      subsidyKind: job.subsidyKind,
      payerPrivyId: job.privyUserId,
    };
    this.swarmLoop.serveRequest({
      model,
      messages: job.messages ?? [],
      params: { maxNew: 512, reasoning: !!job.think, tools: job.toolPassthrough ? job.clientTools : undefined },
      revenue,
      onToken: (delta) => userSocket()?.emit('job:token', { jobId: job.id, token: delta }),
      onDone: (response) => { userSocket()?.emit('job:complete', { jobId: job.id, response }); fin(); },
      onError: (message) => {
        // a swarm that never served owes nothing — refund the charge (classic jobs already refund
        // on timeout; the swarm path used to just drop the job, silently keeping the user's credits).
        // creditsCharged is 0 for free/allowance jobs, so this only refunds real paid spend.
        if (job.privyUserId && job.creditsCharged) {
          refundCredits(job.privyUserId, job.creditsCharged, `Swarm ${model} unavailable: ${message}`);
        }
        userSocket()?.emit('job:error', { jobId: job.id, error: message }); fin();
      },
    });
    job.status = 'processing';
    return true;   // a sharded model is served (or errored) here — never queued to a whole-model worker
  }

  private processQueue() {
    if (this.jobQueue.length === 0) return;

    // Clean stale
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (!job) return false;
      if (!this.io.sockets.sockets.get(job.userSocketId)) {
        this.jobs.delete(jobId);
        return false;
      }
      return true;
    });

    if (this.jobQueue.length === 0) return;

    let matchedJob: Job | null = null;
    let matchedJobIndex = -1;
    let idleWorker: WorkerInfo | null = null;
    let workerSocketId: string | null = null;

    for (let i = 0; i < this.jobQueue.length; i++) {
      const j = this.jobs.get(this.jobQueue[i]);
      if (!j) continue;
      // Weighted-random pick among idle matching workers, weight = avg tok/s
      // (measured throughput, falling back to the registration benchmark). This
      // spreads earnings across the pool instead of always paying the single
      // fastest worker, while still favoring faster workers so users mostly get
      // good speed. Tunable via WORKER_WEIGHT_* in types.ts. Anti-cheat (canaries)
      // still strikes/bans workers that fake high tok/s.
      const eligible: { worker: WorkerInfo; socketId: string; weight: number }[] = [];
      let totalWeight = 0;
      for (const [socketId, worker] of this.workers) {
        if (worker.status !== 'idle') continue;
        if (!workerServesModel(worker, j.requestedModel)) continue;
        // Subsidized free jobs (treasury pays the worker) only go to aged accounts,
        // so a freshly-minted throwaway can't farm the free lane. Paid jobs are open.
        if (j.subsidyKind === 'free' && !worker.accountAgeOk) continue;
        const samples = worker.measuredTokPerSec ?? [];
        const speed = samples.length
          ? samples.reduce((a, b) => a + b, 0) / samples.length
          : (worker.tokPerSec || 0);
        const weight = selectionWeight(speed);
        eligible.push({ worker, socketId, weight });
        totalWeight += weight;
      }
      if (eligible.length) {
        let r = Math.random() * totalWeight;
        let chosen = eligible[eligible.length - 1];
        for (const e of eligible) { if ((r -= e.weight) <= 0) { chosen = e; break; } }
        matchedJob = j;
        matchedJobIndex = i;
        idleWorker = chosen.worker;
        workerSocketId = chosen.socketId;
        break;
      }
    }

    if (!matchedJob || !idleWorker || !workerSocketId || matchedJobIndex === -1) {
      return;
    }

    this.jobQueue.splice(matchedJobIndex, 1);
    const job = matchedJob;
    job.status = 'processing';
    job.assignedWorker = idleWorker.id;
    job.startedAt = new Date();
    idleWorker.status = 'busy';

    const workerSocket = this.io.sockets.sockets.get(workerSocketId);
    if (workerSocket) {
      console.log(`[Orchestrator] Job ${job.id} assigned to worker ${idleWorker.id}`);

      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (userSocket) {
        userSocket.emit('job:assigned', { jobId: job.id, workerId: idleWorker.id });
      }

      let messages = job.messages;

      // Generated images are display-only artifacts (shown to the user inline,
      // never stored) — they must never be fed back to the model as input. An
      // assistant-message image is useless as context and crashes text-only
      // workers with "image input is not supported — mmproj". Strip them before
      // dispatch regardless of client; user-uploaded images (user role) stay for
      // vision-capable workers.
      if (messages && messages.some(m => m.role === 'assistant' && m.images && m.images.length > 0)) {
        messages = messages.map(m =>
          m.role === 'assistant' && m.images ? { ...m, images: undefined } : m
        );
      }

      // Inject system prompt for native workers only (browser workers handle their own)
      if (idleWorker.type === 'native' && messages && messages.length > 0 && !messages.some(m => m.role === 'system')) {
        messages = [
          { role: 'system' as const, content: this.getNativeSystemPrompt() },
          ...messages,
        ];
      }

      // Tools: API passthrough jobs use the caller's own tools (returned to the
      // agent, not run server-side); everything else gets the built-in tools.
      // generate_image is withheld from API-bridge jobs — an API client has no
      // socket channel to receive the rendered image, so it would charge the
      // user for a picture nobody sees.
      const tools = job.toolPassthrough
        ? (job.clientTools && job.clientTools.length ? job.clientTools : undefined)
        : (idleWorker.capabilities.tools
          ? (job.internal ? AVAILABLE_TOOLS.filter((t) => t.function.name !== 'generate_image') : AVAILABLE_TOOLS)
          : undefined);

      workerSocket.emit('job:new', { jobId: job.id, messages, tools, think: job.think ?? false });

      if (idleWorker.type === 'native' && idleWorker.privyUserId) {
        this.pushNativeStatus(idleWorker.privyUserId);
      }
    }

    this.updateQueuePositions();
  }

  private handleJobToken(jobId: string, token: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (!job.serverTokenCount) job.serverTokenCount = 0;
    job.serverTokenCount++;
    // Server-side output safety scan (covers streaming AND non-streaming, since
    // tokens always flow through here). Keep a rolling tail and cut the stream
    // the moment a blocked phrase forms — the offending token is not forwarded.
    job.streamBuffer = ((job.streamBuffer || '') + token).slice(-600);
    if (!scanOutput(job.streamBuffer).safe) {
      this.blockJobForSafety(job);
      return;
    }
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:token', { jobId, token });
    }
  }

  // Cut a job whose output tripped the safety scan: tell the user, stop + free
  // the worker, and drop the job.
  private blockJobForSafety(job: Job) {
    const jobId = job.id;
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) userSocket.emit('job:error', { jobId, error: BLOCKED_MESSAGE });
    const worker = job.assignedWorker ? this.findWorkerById(job.assignedWorker) : undefined;
    if (worker) {
      worker.status = 'idle';
      const ws = this.io.sockets.sockets.get(worker.socketId);
      if (ws) ws.emit('job:cancel', { jobId });
    }
    console.warn(`[Orchestrator] Job ${jobId} output blocked (safety policy)`);
    this.jobs.delete(jobId);
    setTimeout(() => this.processQueue(), 100);
    this.broadcastStats();
  }

  private handleJobComplete(jobId: string, response: string, _workerReportedTokens: number) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    if (job.isCanary) {
      this.handleCanaryComplete(job, response);
      return;
    }

    // Final output safety backstop (the streaming scan in handleJobToken is the
    // primary; this catches any worker that returns a full response without
    // streaming tokens).
    if (response && !scanOutput(response).safe) {
      console.warn(`[Orchestrator] Job ${jobId} full-response blocked (safety policy)`);
      response = BLOCKED_MESSAGE;
    }

    const tokensGenerated = job.serverTokenCount || 0;

    if (tokensGenerated === 0) {
      console.error(`[Orchestrator] Job ${jobId} completed with 0 server-counted tokens — skipping reward`);
      const worker = this.findWorkerById(job.assignedWorker!);
      if (worker) worker.status = 'idle';
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (userSocket) userSocket.emit('job:complete', { jobId, response });
      this.jobs.delete(jobId);
      setTimeout(() => this.processQueue(), 100);
      this.broadcastStats();
      return;
    }

    const MAX_TOKENS_PER_JOB = 4096;
    const cappedTokens = Math.min(tokensGenerated, MAX_TOKENS_PER_JOB);

    job.status = 'completed';
    job.response = response;
    job.completedAt = new Date();

    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) worker.status = 'idle';

    // Real throughput for this job: server-counted tokens / wall-clock seconds.
    let duration = 0;
    let realTokPerSec = 0;
    if (job.startedAt) {
      duration = job.completedAt.getTime() - job.startedAt.getTime();
      realTokPerSec = duration > 0 ? cappedTokens / (duration / 1000) : Infinity;
    }

    // (#2) Anti-fake: a job returned faster than any real GPU can generate means the
    // worker isn't actually running a model. No reward, count a strike, kick on repeats.
    const ceiling = worker?.type === 'native' ? this.MAX_TOK_PER_SEC_NATIVE : this.MAX_TOK_PER_SEC_BROWSER;
    if (cappedTokens >= 20 && realTokPerSec > ceiling) {
      console.error(`[Orchestrator] Job ${jobId} impossible speed: ${cappedTokens} tokens at ${realTokPerSec.toFixed(0)} tok/s (ceiling ${ceiling}) — fake output, no reward`);
      if (worker) {
        worker.fakeStrikes = (worker.fakeStrikes ?? 0) + 1;
        const rep = worker.privyUserId ? recordWorkerStrike(worker.privyUserId, 'speed') : null;
        if (worker.fakeStrikes >= this.MAX_FAKE_STRIKES || rep?.banned) {
          this.kickWorker(worker, `${worker.fakeStrikes} jobs at impossible speed${rep?.banned ? ' (banned)' : ''}`);
        }
      }
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (userSocket) userSocket.emit('job:complete', { jobId, response });
      this.jobs.delete(jobId);
      setTimeout(() => this.processQueue(), 100);
      this.broadcastStats();
      return;
    }

    // (#C) Coherence heuristics: a job that streamed garbage (invalid unicode,
    // character flooding, repetition loops, or nothing) isn't real inference.
    // The user already received the stream, but the worker gets no pay and a strike.
    const coherence = this.checkCoherence(response);
    if (!coherence.ok) {
      console.warn(`[Orchestrator] Job ${jobId} failed coherence (${coherence.reason}) — no reward`);
      if (worker?.privyUserId) {
        const rep = recordWorkerStrike(worker.privyUserId, 'coherence');
        if (rep.banned) this.kickWorker(worker, `banned: ${rep.totalStrikes} strikes (latest: coherence)`);
      }
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (userSocket) userSocket.emit('job:complete', { jobId, response });
      this.jobs.delete(jobId);
      setTimeout(() => this.processQueue(), 100);
      this.broadcastStats();
      return;
    }

    if (duration > 0) {
      this.jobDurations.push(duration);
      if (this.jobDurations.length > this.MAX_DURATION_SAMPLES) {
        this.jobDurations.shift();
      }
    }

    if (worker) {
      worker.jobsCompleted++;
      worker.tokensGenerated += cappedTokens;
      worker.jobsSinceCanary = (worker.jobsSinceCanary ?? 0) + 1;
    }

    this.totalJobsCompleted++;
    this.totalTokensGenerated += cappedTokens;

    if (job.privyUserId) {
      try { incrementPromptsSent(job.privyUserId); } catch (err) {
        console.error('[Orchestrator] Failed to increment prompts_sent:', err);
      }
    }

    if (worker?.privyUserId) {
      try {
        recordCompletedJob({
          jobId,
          workerPrivyId: worker.privyUserId,
          userPrivyId: job.privyUserId,
          model: worker.model,
          tier: worker.type === 'native' ? 'max' : 'pro',
          tokensGenerated: cappedTokens,
          durationMs: duration > 0 ? duration : undefined,
        });
        // Worker pay basis. Paid jobs pay out of their own revenue. Free-prompt
        // jobs (revenue 0) still pay the worker the tier list price, funded by
        // the treasury — but only when it's not a self-deal (worker serving
        // their own prompt) and the private daily subsidy cap has room, so a
        // sybil farm can't drain the treasury overnight.
        const revenueCredits = job.creditsCharged || 0;
        const workerShare = getWorkerRevenueShare(worker.privyUserId);
        let payoutCredits = revenueCredits;
        let subsidized = false;
        if (revenueCredits === 0 && (job.subsidyCredits || 0) > 0 && worker.privyUserId !== job.privyUserId) {
          if (job.subsidyKind === 'allowance') {
            // Staker allowance: the daily pool ceiling was already enforced when
            // the allowance was consumed at submit time, so pay unconditionally.
            payoutCredits = job.subsidyCredits!;
            subsidized = true;
          } else {
            const subsidyUsd = (job.subsidyCredits! / CREDITS_PER_USD) * workerShare;
            if (getTodayFreeSubsidyUsd() + subsidyUsd <= FREE_SUBSIDY_DAILY_CAP_USD) {
              payoutCredits = job.subsidyCredits!;
              subsidized = true;
            } else {
              console.log(`[Orchestrator] Free-prompt subsidy cap reached — worker ${worker.privyUserId} not paid for job ${jobId}`);
            }
          }
        }
        const earnedUsd = recordEarning({
          privyId: worker.privyUserId,
          jobId,
          tier: worker.type === 'native' ? 'max' : 'pro',
          creditsCharged: revenueCredits,
          payoutCredits,
          subsidized,
          subsidyKind: job.subsidyKind,
          tokensGenerated: cappedTokens,
          revenueShare: workerShare,
          payerPrivyId: job.privyUserId,
        });
        if (earnedUsd > 0) {
          console.log(`[Orchestrator] Worker ${worker.privyUserId} earned $${earnedUsd.toFixed(4)} for job ${jobId}`);
        }
      } catch (err) {
        console.error('[Orchestrator] Failed to record job:', err);
      }
    }

    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:complete', { jobId, response });
    }

    // Tell the worker a real job landed so it can log/count it. Canaries return
    // early above and never reach here, so they stay invisible on the terminal.
    if (worker) {
      const workerSocket = this.io.sockets.sockets.get(worker.socketId);
      if (workerSocket) workerSocket.emit('job:counted', { jobId, tokensGenerated: cappedTokens });
    }

    console.log(`[Orchestrator] Job ${jobId} completed`);
    this.jobs.delete(jobId);

    // (#1) Sustained-throughput check: measure real tok/s on substantial jobs and kick
    // workers that pass the signup benchmark but then degrade below the floor.
    let kicked = false;
    if (worker && cappedTokens >= this.MEASURE_MIN_TOKENS && realTokPerSec > 0 && isFinite(realTokPerSec)) {
      const samples = worker.measuredTokPerSec ?? [];
      samples.push(realTokPerSec);
      if (samples.length > this.TOK_SAMPLE_WINDOW) samples.shift();
      worker.measuredTokPerSec = samples;
      // Reflect real measured speed in stats / native status.
      worker.tokPerSec = samples.reduce((a, b) => a + b, 0) / samples.length;
      if (samples.length >= this.MIN_SAMPLES_TO_JUDGE && worker.tokPerSec < this.MIN_TOK_PER_SEC) {
        this.kickWorker(worker, `sustained ${worker.tokPerSec.toFixed(1)} tok/s below ${this.MIN_TOK_PER_SEC} minimum`);
        kicked = true;
      }
    }

    setTimeout(() => this.processQueue(), 100);
    this.broadcastStats();
    if (!kicked && worker && worker.type === 'native' && worker.privyUserId) {
      this.pushNativeStatus(worker.privyUserId);
    }
    if (!kicked && worker) this.maybeDispatchCanary(worker);
  }

  // ── Canary challenges (#A) ──

  // Decide whether to probe a freshly-idle worker. Only fires when no real jobs are
  // queued (never delays a paying user) and either the per-worker job counter is due
  // or a low random roll lands, keeping the frequency near 1-in-15.
  private maybeDispatchCanary(worker: WorkerInfo) {
    if (worker.status !== 'idle') return;
    if (this.jobQueue.length > 0) return;
    const due = (worker.jobsSinceCanary ?? 0) >= this.CANARY_EVERY_N_JOBS;
    if (!due && Math.random() > this.CANARY_RANDOM_PROB) return;
    this.dispatchCanary(worker);
  }

  // Periodic sweep so even a low-volume worker that never trips the counter still
  // gets checked. One worker per tick to stay gentle.
  private canarySweep() {
    if (this.jobQueue.length > 0) return;
    const now = Date.now();
    for (const worker of this.workers.values()) {
      if (worker.status !== 'idle') continue;
      if (worker.lastCanaryAt && now - worker.lastCanaryAt < this.CANARY_SWEEP_IDLE_MS) continue;
      this.dispatchCanary(worker);
      break;
    }
  }

  // Build a challenge that an echo/canned-response worker can't pass: it must read a
  // random nonce (proves it saw the prompt) AND compute a sum (proves it generated,
  // not echoed). Sum is digits, nonce is letters — disjoint, so echoing the prompt
  // can never accidentally contain the answer.
  private buildCanary(): { messages: ChatMessage[]; expected: { sum: number; nonce: string } } {
    const a = 10 + Math.floor(Math.random() * 90);
    const b = 10 + Math.floor(Math.random() * 90);
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    let nonce = '';
    for (let i = 0; i < 4; i++) nonce += letters[Math.floor(Math.random() * letters.length)];
    const sum = a + b;
    const content = `Add the numbers ${a} and ${b}. Then write a single line in the exact format <sum>-${nonce} where <sum> is the result of that addition. Reply with only that line.`;
    return { messages: [{ role: 'user', content }], expected: { sum, nonce } };
  }

  private dispatchCanary(worker: WorkerInfo) {
    // Image workers run no LLM — the text canary (math+nonce) is meaningless to
    // them and would false-strike them. They're verified by producing valid PNGs.
    if (worker.type === 'image') return;
    const socket = this.io.sockets.sockets.get(worker.socketId);
    if (!socket) return;

    const { messages, expected } = this.buildCanary();
    const jobId = uuidv4();
    const job: Job = {
      id: jobId,
      userId: 'canary',
      userSocketId: 'canary',
      messages,
      status: 'processing',
      assignedWorker: worker.id,
      createdAt: new Date(),
      startedAt: new Date(),
      isCanary: true,
      canaryExpected: expected,
    };
    this.jobs.set(jobId, job);
    worker.status = 'busy';
    worker.jobsSinceCanary = 0;
    worker.lastCanaryAt = Date.now();

    // Native workers expect the orchestrator to inject the system prompt; browser
    // workers add their own. Match the real job path so the canary is indistinguishable.
    const outMessages = worker.type === 'native'
      ? [{ role: 'system' as const, content: this.getNativeSystemPrompt() }, ...messages]
      : messages;

    socket.emit('job:new', { jobId, messages: outMessages, tools: undefined, think: false });
  }

  private handleCanaryComplete(job: Job, response: string) {
    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) worker.status = 'idle';
    this.jobs.delete(job.id);

    const exp = job.canaryExpected!;
    // Liveness check: a worker running real inference echoes the nonce that was in
    // the prompt; a faker returning canned text does not. We deliberately DON'T
    // require the arithmetic to be right — honest small/quantized models flub
    // 2-digit math occasionally, and that's a model limitation, not fraud.
    const stripped = response.replace(/<think>[\s\S]*?<\/think>/g, '').toUpperCase();
    const passed = stripped.includes(exp.nonce);

    if (worker?.privyUserId) {
      const rep = recordCanaryResult(worker.privyUserId, passed);
      if (!passed && rep.banned) {
        console.warn(`[Orchestrator] Canary FAILED + BANNED worker ${worker.id} (user=${worker.privyUserId}) — ${rep.recentFails}/${rep.recentTotal} recent fails`);
        this.kickWorker(worker, 'failed canary challenge (banned)');
        setTimeout(() => this.processQueue(), 100);
        return;
      }
      if (!passed) {
        // An isolated miss no longer kicks or strikes toward a ban — keep the
        // worker online; only sustained failure (the window logic) bans.
        console.warn(`[Orchestrator] Canary missed by worker ${worker.id} (user=${worker.privyUserId}) — ${rep.recentFails}/${rep.recentTotal} recent, kept online`);
      } else {
        console.log(`[Orchestrator] Canary passed by worker ${worker.id}`);
      }
    }

    setTimeout(() => this.processQueue(), 100);
    if (worker && worker.type === 'native' && worker.privyUserId) {
      this.pushNativeStatus(worker.privyUserId);
    }
  }

  // Cheap defense-in-depth: catch obviously-broken output that real inference wouldn't
  // produce. Conservative thresholds so legitimate short or technical answers pass.
  private checkCoherence(text: string): { ok: boolean; reason?: string } {
    const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (stripped.length === 0) return { ok: false, reason: 'empty after stripping reasoning' };

    const replacementCount = (stripped.match(/�/g) || []).length;
    if (replacementCount > 5 && replacementCount / stripped.length > 0.05) {
      return { ok: false, reason: 'invalid unicode' };
    }

    if (stripped.length >= 100) {
      const counts = new Map<string, number>();
      for (const ch of stripped) {
        if (/\s/.test(ch)) continue;
        counts.set(ch, (counts.get(ch) || 0) + 1);
      }
      let max = 0;
      for (const v of counts.values()) if (v > max) max = v;
      if (max / stripped.length > 0.6) return { ok: false, reason: 'single-character flooding' };
    }

    const words = stripped.split(/\s+/);
    if (words.length >= 30) {
      const uniqueRatio = new Set(words).size / words.length;
      if (uniqueRatio < 0.15) return { ok: false, reason: 'repetition loop' };
    }

    return { ok: true };
  }

  private kickWorker(worker: WorkerInfo, reason: string) {
    console.warn(`[Orchestrator] Kicking worker ${worker.id} (user=${worker.privyUserId ?? 'unknown'}): ${reason}`);
    const socket = this.io.sockets.sockets.get(worker.socketId);
    if (socket) socket.disconnect(true);
    this.unregisterWorker(worker.socketId);
    this.broadcastStats();
    if ((worker.type === 'native' || worker.type === 'image') && worker.privyUserId) {
      this.pushNativeStatus(worker.privyUserId);
    }
  }

  private handleJobError(jobId: string, error: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // A worker erroring on a canary is treated as neutral (no strike) to avoid
    // false bans from transient failures; it just frees the worker.
    if (job.isCanary) {
      const worker = this.findWorkerById(job.assignedWorker!);
      if (worker) worker.status = 'idle';
      this.jobs.delete(jobId);
      setTimeout(() => this.processQueue(), 100);
      return;
    }

    job.status = 'failed';
    job.error = error;

    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) worker.status = 'idle';

    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:error', { jobId, error });
    }

    console.log(`[Orchestrator] Job ${jobId} failed: ${error}`);

    if (job.privyUserId && job.creditsCharged) {
      refundCredits(job.privyUserId, job.creditsCharged, 'Job failed: ' + error.slice(0, 50));
    }

    this.jobs.delete(jobId);
    setTimeout(() => this.processQueue(), 100);
  }

  private findWorkerById(workerId: string): WorkerInfo | null {
    for (const worker of this.workers.values()) {
      if (worker.id === workerId) return worker;
    }
    return null;
  }

  private findWorkerSocketId(workerId: string): string | null {
    for (const [socketId, worker] of this.workers) {
      if (worker.id === workerId) return socketId;
    }
    return null;
  }

  private updateQueuePositions() {
    this.jobQueue.forEach((jobId, index) => {
      const job = this.jobs.get(jobId);
      if (job) {
        const userSocket = this.io.sockets.sockets.get(job.userSocketId);
        if (userSocket) {
          userSocket.emit('queue:position', { position: index + 1 });
        }
      }
    });
  }

  private getAvgJobDuration(): number {
    if (this.jobDurations.length === 0) return 0;
    return Math.round(this.jobDurations.reduce((a, b) => a + b, 0) / this.jobDurations.length);
  }

  private pushNativeStatus(privyUserId: string) {
    // Both native (text) and image workers are user-run CLI workers and should
    // light up the "your worker is online" card; only in-browser 'browser'
    // workers are excluded. Image workers report 0 tok/s by design (they render
    // images, not tokens) — the `type` field lets the card show images-rendered
    // instead of a misleading "0 tok/s".
    let userWorker: WorkerInfo | null = null;
    for (const w of this.workers.values()) {
      if (w.privyUserId === privyUserId && (w.type === 'native' || w.type === 'image')) {
        userWorker = w;
        break;
      }
    }

    const statusData = userWorker
      ? {
          online: true,
          workerId: userWorker.id,
          type: userWorker.type,
          // epoch ms the worker connected — the card derives live uptime from this,
          // so it works for CLI workers (run outside the browser) and is identical
          // on every device the user opens.
          connectedAt: userWorker.connectedAt.getTime(),
          jobsCompleted: userWorker.jobsCompleted,
          tokensGenerated: userWorker.tokensGenerated,
          tokPerSec: userWorker.tokPerSec,
          currentJob: userWorker.status === 'busy' ? 'processing' : undefined,
        }
      : { online: false, jobsCompleted: 0, tokensGenerated: 0, tokPerSec: 0 };

    for (const [socketId, socket] of this.io.sockets.sockets) {
      const sid = (socket as any).privyUserId;
      if (sid === privyUserId) {
        const worker = this.workers.get(socketId);
        if (worker && (worker.type === 'native' || worker.type === 'image')) continue;
        socket.emit('native:status', statusData);
      }
    }
  }

  private getWorkerCounts(): { browser: number; native: number; nativeByModel: Record<string, number>; total: number } {
    let browser = 0;
    let native = 0;
    let total = 0;
    const nativeByModel: Record<string, number> = {};
    for (const w of this.workers.values()) {
      // Un-aged (freshly-minted) accounts don't count toward the public network stats.
      if (!w.accountAgeOk) continue;
      total++;
      if (w.type === 'native') {
        native++;
        nativeByModel[w.model] = (nativeByModel[w.model] ?? 0) + 1;
      } else browser++;
    }
    return { browser, native, nativeByModel, total };
  }

  private buildStats(): NetworkStats {
    const counts = this.getWorkerCounts();
    return {
      workersOnline: counts.total,
      browserWorkers: counts.browser,
      nativeWorkers: counts.native,
      nativeByModel: counts.nativeByModel,
      jobsInQueue: this.jobQueue.length,
      jobsCompleted: this.totalJobsCompleted,
      tokensGenerated: this.totalTokensGenerated,
      avgJobDurationMs: this.getAvgJobDuration(),
    };
  }

  private broadcastStats() {
    this.io.emit('stats:update', this.buildStats());
  }

  getStats(): NetworkStats {
    return this.buildStats();
  }
}

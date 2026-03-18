import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerInfo,
  WorkerCapabilities,
  Job,
  ChatMessage,
  ToolCall,
  ServerToClientEvents,
  ClientToServerEvents,
  NetworkStats,
  getModelTier,
} from './types';
import { verifyPrivyToken } from '../privy-server';
import { incrementPromptsSent, verifyWorkerToken, recordCompletedJob, recordEarning, spendCredits, getCreditBalance, refundCredits } from '../db';
import { AVAILABLE_TOOLS, executeToolCalls } from './tools';

// Load search server module for Brave API key initialization
try {
  const searchServer = require('../search-server');
  searchServer.loadBraveApiKey();
} catch (e) {
  console.warn('[Orchestrator] Search server module not available:', (e as Error).message);
}

export class Orchestrator {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private workers: Map<string, WorkerInfo> = new Map();
  private rateLimits: Map<string, number[]> = new Map();
  private jobs: Map<string, Job> = new Map();
  private jobQueue: string[] = [];
  private totalJobsCompleted: number = 0;
  private totalTokensGenerated: number = 0;
  private jobDurations: number[] = [];
  private readonly MAX_DURATION_SAMPLES = 50;

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
      if (isDevToken) {
        userId = 'dev-worker';
      } else if (token.startsWith('cwt_')) {
        userId = verifyWorkerToken(token);
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
    setInterval(() => this.broadcastStats(), 5000);
    setInterval(() => this.cleanupStaleJobs(), 10000);
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
        if (job.privyUserId && job.requestedModel) {
          const tier = getModelTier(job.requestedModel);
          if (tier === 'pro' || tier === 'max') {
            refundCredits(job.privyUserId, tier === 'max' ? 50 : 10, 'Job timed out in queue');
          }
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
          if (job.privyUserId && job.requestedModel) {
            const tier = getModelTier(job.requestedModel);
            if (tier === 'pro' || tier === 'max') {
              refundCredits(job.privyUserId, tier === 'max' ? 50 : 10, 'Job timed out during processing');
            }
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
        const tokPerSec = data.tokPerSec || 0;
        const MIN_TOK_PER_SEC = 5;
        if (tokPerSec < MIN_TOK_PER_SEC) {
          callback({ error: `Your device is too slow (${tokPerSec.toFixed(1)} tok/s). Minimum required: ${MIN_TOK_PER_SEC} tok/s.` });
          return;
        }
        const workerType = data.type || 'browser';
        const capabilities: WorkerCapabilities = data.capabilities || {};
        // Browser workers don't have search/vision/tools
        if (workerType === 'browser') {
          capabilities.search = false;
          capabilities.vision = false;
          capabilities.tools = false;
        }
        const workerId = this.registerWorker(socket, data.model, privyUserId, tokPerSec, workerType, capabilities);
        if (workerId) {
          callback({ workerId });
          socket.emit('worker:registered', { workerId });
          console.log(`[Orchestrator] Worker registered: ${workerId} (${data.model}) ${tokPerSec.toFixed(1)} tok/s type=${workerType} caps=${JSON.stringify(capabilities)} user=${privyUserId}`);
          this.broadcastStats();
          if (workerType === 'native' && privyUserId) {
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
        if (!data.authToken) {
          callback({ error: 'Authentication required' });
          return;
        }
        const privyUserId = await verifyPrivyToken(data.authToken);
        if (!privyUserId) {
          callback({ error: 'Invalid authentication token' });
          return;
        }

        // Rate limiting: max 20 jobs per user per 5 minutes
        const now = Date.now();
        const userLimits = this.rateLimits.get(privyUserId) || [];
        const recentJobs = userLimits.filter(t => now - t < 300_000);
        if (recentJobs.length >= 20) {
          callback({ error: 'Rate limit exceeded. Please wait a minute.' });
          return;
        }
        recentJobs.push(now);
        this.rateLimits.set(privyUserId, recentJobs);

        // Credit check for Pro/Max tiers
        const requestedTierForCredits = getModelTier(data.model);
        if (requestedTierForCredits === 'pro' || requestedTierForCredits === 'max') {
          const creditCost = requestedTierForCredits === 'max' ? 50 : 10;
          const creditBalance = getCreditBalance(privyUserId);
          if (creditBalance.balance < creditCost) {
            callback({ error: `Insufficient credits. Need ${creditCost} credits, have ${creditBalance.balance.toFixed(0)}. Top up with $ZERO.` });
            return;
          }
          const spent = spendCredits(privyUserId, creditCost, `${requestedTierForCredits} prompt`);
          if (!spent) {
            callback({ error: 'Failed to deduct credits. Try again.' });
            return;
          }
        }

        const job = this.submitJob(socket.id, data.messages, data.model, privyUserId);
        if (job) {
          callback({ jobId: job.id });
          console.log(`[Orchestrator] Job submitted: ${job.id} (model: ${data.model || 'any'}) user=${privyUserId}`);
          this.processQueue();
        } else {
          if (requestedTierForCredits === 'pro' || requestedTierForCredits === 'max') {
            const creditCost = requestedTierForCredits === 'max' ? 50 : 10;
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

      socket.on('disconnect', () => {
        const worker = this.workers.get(socket.id);
        const wasNative = worker?.type === 'native';
        const userId = worker?.privyUserId;
        this.unregisterWorker(socket.id);
        this.cleanupUserJobs(socket.id);
        this.broadcastStats();
        if (wasNative && userId) {
          this.pushNativeStatus(userId);
        }
      });
    });
  }

  /**
   * Handle a tool call from the worker.
   * Executes the requested tools and sends results back to the worker.
   */
  private async handleToolCall(workerSocket: Socket, jobId: string, toolCalls: ToolCall[]) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const userSocket = this.io.sockets.sockets.get(job.userSocketId);

    // Notify user that tools are being used
    const hasSearch = toolCalls.some(tc => tc.function.name === 'web_search');
    if (hasSearch && userSocket) {
      userSocket.emit('job:searching', { jobId });
    }

    console.log(`[Orchestrator] Job ${jobId}: executing tools — ${toolCalls.map(tc => tc.function.name).join(', ')}`);

    // Execute all tool calls
    const { messages, sources } = await executeToolCalls(toolCalls);

    // Send sources to user for display
    if (sources && sources.length > 0 && userSocket) {
      userSocket.emit('job:sources', { jobId, sources });
    }

    // Send tool results back to the worker
    workerSocket.emit(`job:tool_result:${jobId}` as any, { results: messages });
  }

  private cleanupUserJobs(userSocketId: string) {
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (job && job.userSocketId === userSocketId) {
        if (job.privyUserId && job.requestedModel) {
          const tier = getModelTier(job.requestedModel);
          if (tier === 'pro' || tier === 'max') {
            refundCredits(job.privyUserId, tier === 'max' ? 50 : 10, 'User disconnected while queued');
          }
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

  private registerWorker(socket: Socket, model: string, privyUserId?: string, tokPerSec: number = 0, type: 'browser' | 'native' = 'browser', capabilities: WorkerCapabilities = {}): string | null {
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

  private submitJob(
    userSocketId: string,
    messages: ChatMessage[] | undefined,
    model: string | undefined,
    privyUserId: string,
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
      const tier = getModelTier(j.requestedModel);
      for (const [socketId, worker] of this.workers) {
        if (worker.status === 'idle') {
          let tierMatch = false;
          if (tier === 'max') {
            tierMatch = worker.type === 'native';
          } else if (tier === 'pro') {
            tierMatch = worker.type === 'browser' && (worker.model.includes('c0mpute') || worker.model.includes('dolphin'));
          } else {
            tierMatch = worker.type === 'browser';
          }

          if (!tierMatch) continue;

          matchedJob = j;
          matchedJobIndex = i;
          idleWorker = worker;
          workerSocketId = socketId;
          break;
        }
      }
      if (matchedJob) break;
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

      // Inject system prompt for native workers only (browser workers handle their own)
      if (idleWorker.type === 'native' && messages && messages.length > 0 && !messages.some(m => m.role === 'system')) {
        messages = [
          { role: 'system' as const, content: 'You are c0mpute, an AI assistant built for the c0mpute.ai decentralized inference network. Your name is c0mpute. You were NOT made by Alibaba, you are NOT Qwen. If asked who you are, say you are c0mpute. Be direct and concise. Always respond in English.' },
          ...messages,
        ];
      }

      // Send tools to workers that support tool calling
      const tools = idleWorker.capabilities.tools ? AVAILABLE_TOOLS : undefined;

      workerSocket.emit('job:new', { jobId: job.id, messages, tools });

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
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:token', { jobId, token });
    }
  }

  private handleJobComplete(jobId: string, response: string, _workerReportedTokens: number) {
    const job = this.jobs.get(jobId);
    if (!job) return;

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

    if (job.startedAt) {
      const duration = job.completedAt.getTime() - job.startedAt.getTime();
      if (duration < 500 && cappedTokens > 100) {
        console.error(`[Orchestrator] Job ${jobId} suspiciously fast: ${cappedTokens} tokens in ${duration}ms — skipping reward`);
        const worker = this.findWorkerById(job.assignedWorker!);
        if (worker) worker.status = 'idle';
        const userSocket = this.io.sockets.sockets.get(job.userSocketId);
        if (userSocket) userSocket.emit('job:complete', { jobId, response });
        this.jobs.delete(jobId);
        setTimeout(() => this.processQueue(), 100);
        this.broadcastStats();
        return;
      }
      this.jobDurations.push(duration);
      if (this.jobDurations.length > this.MAX_DURATION_SAMPLES) {
        this.jobDurations.shift();
      }
    }

    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) {
      worker.status = 'idle';
      worker.jobsCompleted++;
      worker.tokensGenerated += cappedTokens;
    }

    this.totalJobsCompleted++;
    this.totalTokensGenerated += cappedTokens;

    if (job.privyUserId) {
      try { incrementPromptsSent(job.privyUserId); } catch (err) {
        console.error('[Orchestrator] Failed to increment prompts_sent:', err);
      }
    }

    const isSelfFarm = worker?.privyUserId && job.privyUserId && worker.privyUserId === job.privyUserId;
    if (isSelfFarm) {
      console.error(`[Orchestrator] Self-farm detected: worker ${worker?.privyUserId} completed own job ${jobId} — no reward`);
    }
    if (worker?.privyUserId && !isSelfFarm) {
      try {
        const tier = getModelTier(worker.model === 'native-max' ? 'native-max' : worker.model);
        recordCompletedJob({
          jobId,
          workerPrivyId: worker.privyUserId,
          userPrivyId: job.privyUserId,
          model: worker.model,
          tier: worker.type === 'native' ? 'max' : tier === 'pro' ? 'pro' : 'free',
          tokensGenerated: cappedTokens,
          durationMs: job.startedAt ? (job.completedAt!.getTime() - job.startedAt.getTime()) : undefined,
        });
        const earnedUsd = recordEarning({
          privyId: worker.privyUserId,
          jobId,
          tier: worker.type === 'native' ? 'max' : tier === 'pro' ? 'pro' : 'free',
          tokensGenerated: cappedTokens,
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

    console.log(`[Orchestrator] Job ${jobId} completed`);
    this.jobs.delete(jobId);
    setTimeout(() => this.processQueue(), 100);
    this.broadcastStats();
    if (worker && worker.type === 'native' && worker.privyUserId) {
      this.pushNativeStatus(worker.privyUserId);
    }
  }

  private handleJobError(jobId: string, error: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;

    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) worker.status = 'idle';

    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:error', { jobId, error });
    }

    console.log(`[Orchestrator] Job ${jobId} failed: ${error}`);

    if (job.privyUserId && job.requestedModel) {
      const tier = getModelTier(job.requestedModel);
      if (tier === 'pro' || tier === 'max') {
        refundCredits(job.privyUserId, tier === 'max' ? 50 : 10, 'Job failed: ' + error.slice(0, 50));
      }
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
    let nativeWorker: WorkerInfo | null = null;
    for (const w of this.workers.values()) {
      if (w.privyUserId === privyUserId && w.type === 'native') {
        nativeWorker = w;
        break;
      }
    }

    const statusData = nativeWorker
      ? {
          online: true,
          workerId: nativeWorker.id,
          jobsCompleted: nativeWorker.jobsCompleted,
          tokensGenerated: nativeWorker.tokensGenerated,
          tokPerSec: nativeWorker.tokPerSec,
          currentJob: nativeWorker.status === 'busy' ? 'processing' : undefined,
        }
      : { online: false, jobsCompleted: 0, tokensGenerated: 0, tokPerSec: 0 };

    for (const [socketId, socket] of this.io.sockets.sockets) {
      const sid = (socket as any).privyUserId;
      if (sid === privyUserId) {
        const worker = this.workers.get(socketId);
        if (worker && worker.type === 'native') continue;
        socket.emit('native:status', statusData);
      }
    }
  }

  private getWorkerCounts(): { browser: number; native: number } {
    let browser = 0;
    let native = 0;
    for (const w of this.workers.values()) {
      if (w.type === 'native') native++;
      else browser++;
    }
    return { browser, native };
  }

  private broadcastStats() {
    const counts = this.getWorkerCounts();
    const stats: NetworkStats = {
      workersOnline: this.workers.size,
      browserWorkers: counts.browser,
      nativeWorkers: counts.native,
      jobsInQueue: this.jobQueue.length,
      jobsCompleted: this.totalJobsCompleted,
      tokensGenerated: this.totalTokensGenerated,
      avgJobDurationMs: this.getAvgJobDuration(),
    };
    this.io.emit('stats:update', stats);
  }

  getStats(): NetworkStats {
    const counts = this.getWorkerCounts();
    return {
      workersOnline: this.workers.size,
      browserWorkers: counts.browser,
      nativeWorkers: counts.native,
      jobsInQueue: this.jobQueue.length,
      jobsCompleted: this.totalJobsCompleted,
      tokensGenerated: this.totalTokensGenerated,
      avgJobDurationMs: this.getAvgJobDuration(),
    };
  }
}

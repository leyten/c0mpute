import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerInfo,
  WorkerCapabilities,
  Job,
  ChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
  NetworkStats,
} from './types';
import { verifyPrivyToken } from '../privy-server';
import { incrementPromptsSent } from '../db';
// Dynamic imports for server-only modules (avoid Turbopack resolution)
let shouldSearch: (msg: string, prev?: { role: string; content: string }[]) => boolean = () => false;
let extractQuery: (msg: string, prev?: { role: string; content: string }[]) => string = (msg) => msg;
let searchBrave: (query: string) => Promise<{title:string;url:string;description:string}[]> = async () => [];
let formatSearchContext: (results: {title:string;url:string;description:string}[]) => string = () => '';

// Load search modules at runtime (server-only, not during Next.js build)
try {
  const search = require('../search');
  const searchServer = require('../search-server');
  shouldSearch = search.shouldSearch;
  extractQuery = search.extractQuery;
  searchBrave = searchServer.braveSearch;
  formatSearchContext = searchServer.formatSearchContext;
  searchServer.loadBraveApiKey();
} catch (e) {
  console.warn('[Orchestrator] Search modules not available:', (e as Error).message);
}

export class Orchestrator {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private workers: Map<string, WorkerInfo> = new Map();
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
      const userId = await verifyPrivyToken(token);
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
    const JOB_TIMEOUT_MS = 60000;

    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (!job) return false;
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (!userSocket) {
        console.log(`[Orchestrator] Cleanup: Removing job ${jobId} - user disconnected`);
        this.jobs.delete(jobId);
        return false;
      }
      const jobAge = now - job.createdAt.getTime();
      if (jobAge > JOB_TIMEOUT_MS) {
        console.log(`[Orchestrator] Cleanup: Removing job ${jobId} - timed out after ${Math.round(jobAge / 1000)}s`);
        userSocket.emit('job:error', { jobId, error: 'Job timed out' });
        this.jobs.delete(jobId);
        return false;
      }
      return true;
    });

    for (const [jobId, job] of this.jobs) {
      if (job.status === 'processing' && job.startedAt) {
        const processingTime = now - job.startedAt.getTime();
        if (processingTime > JOB_TIMEOUT_MS) {
          console.log(`[Orchestrator] Cleanup: Job ${jobId} timed out during processing`);
          const userSocket = this.io.sockets.sockets.get(job.userSocketId);
          if (userSocket) {
            userSocket.emit('job:error', { jobId, error: 'Job timed out during processing' });
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
      console.log(`[Orchestrator] Client connected: ${socket.id}`);

      // Worker registration
      socket.on('worker:register', async (data, callback) => {
        if (!data.authToken) {
          callback({ error: 'Authentication required' });
          return;
        }
        const privyUserId = await verifyPrivyToken(data.authToken);
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
        // Browser workers never have search capability
        if (workerType === 'browser') {
          capabilities.search = false;
        }
        const workerId = this.registerWorker(socket, data.model, privyUserId, tokPerSec, workerType, capabilities);
        if (workerId) {
          callback({ workerId });
          socket.emit('worker:registered', { workerId });
          console.log(`[Orchestrator] Worker registered: ${workerId} (${data.model}) ${tokPerSec.toFixed(1)} tok/s type=${workerType} user=${privyUserId}`);
          this.broadcastStats();
        } else {
          callback({ error: 'Failed to register worker' });
        }
      });

      socket.on('worker:unregister', () => {
        this.unregisterWorker(socket.id);
        this.broadcastStats();
      });

      // Job submission — with orchestrator-side web search
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

        // Check if any search-capable workers are online
        const hasSearchWorker = Array.from(this.workers.values()).some(
          w => w.capabilities.search === true
        );

        // Check if web search would help (only if search-capable workers exist)
        let searchContext: string | undefined;
        let searchResults: { title: string; url: string; description: string }[] | undefined;
        if (hasSearchWorker && data.messages && data.messages.length > 0) {
          const lastMessage = data.messages[data.messages.length - 1].content;
          const previousMessages = data.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
          if (shouldSearch(lastMessage, previousMessages)) {
            const searchQuery = extractQuery(lastMessage, previousMessages);
            // Notify user that we're searching
            socket.emit('job:searching', { jobId: 'pending' });
            console.log(`[Orchestrator] Searching for: "${searchQuery.substring(0, 80)}..."`);
            try {
              const results = await searchBrave(searchQuery);
              if (results.length > 0) {
                searchContext = formatSearchContext(results);
                searchResults = results;
                console.log(`[Orchestrator] Search returned ${results.length} results`);
              }
            } catch (err) {
              console.error('[Orchestrator] Search failed:', err);
            }
          }
        }

        const job = this.submitJob(socket.id, data.messages, data.model, privyUserId, searchContext, searchResults);
        if (job) {
          callback({ jobId: job.id });
          console.log(`[Orchestrator] Job submitted: ${job.id} (model: ${data.model || 'any'}) user=${privyUserId}`);
          this.processQueue();
        } else {
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

      socket.on('disconnect', () => {
        console.log(`[Orchestrator] Client disconnected: ${socket.id}`);
        this.unregisterWorker(socket.id);
        this.cleanupUserJobs(socket.id);
        this.broadcastStats();
      });
    });
  }

  private cleanupUserJobs(userSocketId: string) {
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (job && job.userSocketId === userSocketId) {
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
    searchContext?: string,
    searchResults?: { title: string; url: string; description: string }[],
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
        searchContext,
        searchResults,
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
      for (const [socketId, worker] of this.workers) {
        if (worker.status === 'idle') {
          if (!j.requestedModel || worker.model === j.requestedModel) {
            // Jobs with search context require a search-capable worker
            if (j.searchContext && !worker.capabilities.search) continue;
            matchedJob = j;
            matchedJobIndex = i;
            idleWorker = worker;
            workerSocketId = socketId;
            break;
          }
        }
      }
      if (matchedJob) break;
    }

    if (!matchedJob || !idleWorker || !workerSocketId || matchedJobIndex === -1) {
      console.log('[Orchestrator] No matching idle workers available');
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
        // Send search sources to user for display
        if (job.searchResults && job.searchResults.length > 0) {
          userSocket.emit('job:sources', { jobId: job.id, sources: job.searchResults });
        }
      }

      // If search context exists, inject it into the last user message
      let messages = job.messages;
      if (job.searchContext && messages && messages.length > 0) {
        messages = [...messages];
        const lastIdx = messages.length - 1;
        messages[lastIdx] = {
          ...messages[lastIdx],
          content: `${job.searchContext}\n\nBased on the search results above, answer this: ${messages[lastIdx].content}\n\nIMPORTANT: Use NEW information from the search results. Do NOT repeat your previous answer.`,
        };
      }

      workerSocket.emit('job:new', { jobId: job.id, messages });
    }

    this.updateQueuePositions();
  }

  private handleJobToken(jobId: string, token: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:token', { jobId, token });
    }
  }

  private handleJobComplete(jobId: string, response: string, tokensGenerated: number) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.response = response;
    job.completedAt = new Date();

    if (job.startedAt) {
      const duration = job.completedAt.getTime() - job.startedAt.getTime();
      this.jobDurations.push(duration);
      if (this.jobDurations.length > this.MAX_DURATION_SAMPLES) {
        this.jobDurations.shift();
      }
    }

    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) {
      worker.status = 'idle';
      worker.jobsCompleted++;
      worker.tokensGenerated += tokensGenerated;
    }

    this.totalJobsCompleted++;
    this.totalTokensGenerated += tokensGenerated;

    if (job.privyUserId) {
      try { incrementPromptsSent(job.privyUserId); } catch (err) {
        console.error('[Orchestrator] Failed to increment prompts_sent:', err);
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

  private broadcastStats() {
    const stats: NetworkStats = {
      workersOnline: this.workers.size,
      jobsInQueue: this.jobQueue.length,
      jobsCompleted: this.totalJobsCompleted,
      tokensGenerated: this.totalTokensGenerated,
      avgJobDurationMs: this.getAvgJobDuration(),
    };
    this.io.emit('stats:update', stats);
  }

  getStats(): NetworkStats {
    return {
      workersOnline: this.workers.size,
      jobsInQueue: this.jobQueue.length,
      jobsCompleted: this.totalJobsCompleted,
      tokensGenerated: this.totalTokensGenerated,
      avgJobDurationMs: this.getAvgJobDuration(),
    };
  }
}

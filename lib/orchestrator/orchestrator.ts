import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import {
  WorkerInfo,
  Job,
  ChatMessage,
  ServerToClientEvents,
  ClientToServerEvents,
  NetworkStats,
} from './types';

export class Orchestrator {
  private io: Server<ClientToServerEvents, ServerToClientEvents>;
  private workers: Map<string, WorkerInfo> = new Map();
  private jobs: Map<string, Job> = new Map();
  private jobQueue: string[] = [];
  private totalJobsCompleted: number = 0;
  private totalTokensGenerated: number = 0;
  private jobDurations: number[] = []; // Recent job durations for averaging
  private readonly MAX_DURATION_SAMPLES = 50; // Keep last 50 job durations

  constructor(io: Server<ClientToServerEvents, ServerToClientEvents>) {
    this.io = io;
    this.setupEventHandlers();
    
    // Broadcast stats every 5 seconds
    setInterval(() => this.broadcastStats(), 5000);
    
    // Clean up stale jobs every 10 seconds
    setInterval(() => this.cleanupStaleJobs(), 10000);
  }

  // Periodic cleanup of stale jobs
  private cleanupStaleJobs() {
    const now = Date.now();
    const JOB_TIMEOUT_MS = 60000; // 1 minute timeout for jobs
    
    // Clean up old jobs from queue
    const beforeQueueLength = this.jobQueue.length;
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (!job) return false;
      
      // Remove if user disconnected
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (!userSocket) {
        console.log(`[Orchestrator] Cleanup: Removing job ${jobId} - user disconnected`);
        this.jobs.delete(jobId);
        return false;
      }
      
      // Remove if job is too old
      const jobAge = now - job.createdAt.getTime();
      if (jobAge > JOB_TIMEOUT_MS) {
        console.log(`[Orchestrator] Cleanup: Removing job ${jobId} - timed out after ${Math.round(jobAge/1000)}s`);
        userSocket.emit('job:error', { jobId, error: 'Job timed out' });
        this.jobs.delete(jobId);
        return false;
      }
      
      return true;
    });
    
    // Also check processing jobs for timeout
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'processing' && job.startedAt) {
        const processingTime = now - job.startedAt.getTime();
        if (processingTime > JOB_TIMEOUT_MS) {
          console.log(`[Orchestrator] Cleanup: Job ${jobId} timed out during processing`);
          
          // Notify user
          const userSocket = this.io.sockets.sockets.get(job.userSocketId);
          if (userSocket) {
            userSocket.emit('job:error', { jobId, error: 'Job timed out during processing' });
          }
          
          // Mark worker as idle again
          if (job.assignedWorker) {
            const worker = this.findWorkerById(job.assignedWorker);
            if (worker) {
              worker.status = 'idle';
            }
          }
          
          this.jobs.delete(jobId);
        }
      }
    }
    
    if (beforeQueueLength !== this.jobQueue.length) {
      this.broadcastStats();
    }
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`[Orchestrator] Client connected: ${socket.id}`);

      // Worker registration
      socket.on('worker:register', (data, callback) => {
        const workerId = this.registerWorker(socket, data.model);
        if (workerId) {
          callback({ workerId });
          socket.emit('worker:registered', { workerId });
          console.log(`[Orchestrator] Worker registered: ${workerId} (${data.model})`);
          this.broadcastStats();
        } else {
          callback({ error: 'Failed to register worker' });
        }
      });

      // Worker unregistration
      socket.on('worker:unregister', () => {
        this.unregisterWorker(socket.id);
        console.log(`[Orchestrator] Worker unregistered: ${socket.id}`);
        this.broadcastStats();
      });

      // Job submission from user
      socket.on('job:submit', (data, callback) => {
        const job = this.submitJob(socket.id, data.messages);
        if (job) {
          callback({ jobId: job.id });
          console.log(`[Orchestrator] Job submitted: ${job.id}`);
          this.processQueue();
        } else {
          callback({ error: 'Failed to submit job' });
        }
      });

      // Token stream from worker
      socket.on('job:token', (data) => {
        this.handleJobToken(data.jobId, data.token);
      });

      // Job completion from worker
      socket.on('job:complete', (data) => {
        this.handleJobComplete(data.jobId, data.response, data.tokensGenerated);
      });

      // Job error from worker
      socket.on('job:error', (data) => {
        this.handleJobError(data.jobId, data.error);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`[Orchestrator] Client disconnected: ${socket.id}`);
        this.unregisterWorker(socket.id);
        this.cleanupUserJobs(socket.id); // Clean up any jobs from this user
        this.broadcastStats();
      });
    });
  }

  // Clean up all jobs from a disconnected user
  private cleanupUserJobs(userSocketId: string) {
    // Remove from queue
    const beforeLength = this.jobQueue.length;
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (job && job.userSocketId === userSocketId) {
        console.log(`[Orchestrator] Removing job ${jobId} - user ${userSocketId} disconnected`);
        this.jobs.delete(jobId);
        return false;
      }
      return true;
    });
    
    // Also mark any in-progress jobs as orphaned (they'll complete but response won't be sent)
    for (const [jobId, job] of this.jobs) {
      if (job.userSocketId === userSocketId && job.status === 'processing') {
        console.log(`[Orchestrator] Job ${jobId} orphaned - user disconnected during processing`);
        job.status = 'failed';
        job.error = 'User disconnected';
      }
    }
    
    if (beforeLength !== this.jobQueue.length) {
      console.log(`[Orchestrator] Cleaned ${beforeLength - this.jobQueue.length} jobs from queue`);
    }
  }

  private registerWorker(socket: Socket, model: string): string | null {
    try {
      const workerId = uuidv4();
      const worker: WorkerInfo = {
        id: workerId,
        socketId: socket.id,
        model,
        status: 'idle',
        connectedAt: new Date(),
        jobsCompleted: 0,
        tokensGenerated: 0,
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
      // If worker had an assigned job, requeue it (only if user is still connected)
      for (const [jobId, job] of this.jobs) {
        if (job.assignedWorker === worker.id && job.status === 'processing') {
          // Check if user is still connected
          const userSocket = this.io.sockets.sockets.get(job.userSocketId);
          if (userSocket) {
            job.status = 'pending';
            job.assignedWorker = undefined;
            this.jobQueue.unshift(jobId); // Add back to front of queue
            console.log(`[Orchestrator] Job ${jobId} requeued due to worker disconnect`);
          } else {
            // User is gone, just delete the job
            console.log(`[Orchestrator] Job ${jobId} deleted - worker and user both disconnected`);
            this.jobs.delete(jobId);
          }
        }
      }
      this.workers.delete(socketId);
    }
  }

  private submitJob(userSocketId: string, messages: ChatMessage[]): Job | null {
    try {
      const jobId = uuidv4();
      const job: Job = {
        id: jobId,
        userId: userSocketId, // In production, use actual user ID
        userSocketId,
        messages,
        status: 'pending',
        createdAt: new Date(),
      };
      this.jobs.set(jobId, job);
      this.jobQueue.push(jobId);
      
      // Notify user of queue position
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

    // Clean up stale jobs (user disconnected)
    this.jobQueue = this.jobQueue.filter(jobId => {
      const job = this.jobs.get(jobId);
      if (!job) return false;
      
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (!userSocket) {
        console.log(`[Orchestrator] Removing stale job ${jobId} - user disconnected`);
        this.jobs.delete(jobId);
        return false;
      }
      return true;
    });

    if (this.jobQueue.length === 0) return;

    // Find an idle worker
    let idleWorker: WorkerInfo | null = null;
    let workerSocketId: string | null = null;

    for (const [socketId, worker] of this.workers) {
      if (worker.status === 'idle') {
        idleWorker = worker;
        workerSocketId = socketId;
        break;
      }
    }

    if (!idleWorker || !workerSocketId) {
      console.log('[Orchestrator] No idle workers available');
      return;
    }

    // Get next job from queue
    const jobId = this.jobQueue.shift();
    if (!jobId) return;

    const job = this.jobs.get(jobId);
    if (!job) return;

    // Assign job to worker
    job.status = 'assigned';
    job.assignedWorker = idleWorker.id;
    idleWorker.status = 'busy';

    // Send job to worker
    const workerSocket = this.io.sockets.sockets.get(workerSocketId);
    if (workerSocket) {
      console.log(`[Orchestrator] Sending job:new event to worker socket ${workerSocketId}`);
      workerSocket.emit('job:new', { jobId: job.id, messages: job.messages });
      job.status = 'processing';
      job.startedAt = new Date(); // Track when processing started
      console.log(`[Orchestrator] Job ${job.id} assigned to worker ${idleWorker.id}`);

      // Notify user
      const userSocket = this.io.sockets.sockets.get(job.userSocketId);
      if (userSocket) {
        userSocket.emit('job:assigned', { jobId: job.id, workerId: idleWorker.id });
      }
    }

    // Update queue positions for other users
    this.updateQueuePositions();
  }

  private handleJobToken(jobId: string, token: string) {
    const job = this.jobs.get(jobId);
    if (!job) {
      console.log(`[Orchestrator] Token for unknown job: ${jobId}`);
      return;
    }

    // Forward token to user
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:token', { jobId, token });
    } else {
      console.log(`[Orchestrator] Cannot forward token - user socket ${job.userSocketId} not found for job ${jobId}`);
    }
  }

  private handleJobComplete(jobId: string, response: string, tokensGenerated: number) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.response = response;
    job.completedAt = new Date();

    // Track job duration for averaging
    if (job.startedAt) {
      const duration = job.completedAt.getTime() - job.startedAt.getTime();
      this.jobDurations.push(duration);
      // Keep only recent samples
      if (this.jobDurations.length > this.MAX_DURATION_SAMPLES) {
        this.jobDurations.shift();
      }
    }

    // Update worker stats
    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) {
      worker.status = 'idle';
      worker.jobsCompleted++;
      worker.tokensGenerated += tokensGenerated;
    }

    // Update global stats
    this.totalJobsCompleted++;
    this.totalTokensGenerated += tokensGenerated;

    // Notify user
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:complete', { jobId, response });
    }

    console.log(`[Orchestrator] Job ${jobId} completed`);

    // Small delay before processing next job to let worker fully reset
    setTimeout(() => {
      this.processQueue();
    }, 100);
    
    this.broadcastStats();
  }

  private handleJobError(jobId: string, error: string) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;

    // Update worker status
    const worker = this.findWorkerById(job.assignedWorker!);
    if (worker) {
      worker.status = 'idle';
    }

    // Notify user
    const userSocket = this.io.sockets.sockets.get(job.userSocketId);
    if (userSocket) {
      userSocket.emit('job:error', { jobId, error });
    }

    console.log(`[Orchestrator] Job ${jobId} failed: ${error}`);

    // Small delay before processing next job
    setTimeout(() => {
      this.processQueue();
    }, 100);
  }

  private findWorkerById(workerId: string): WorkerInfo | null {
    for (const worker of this.workers.values()) {
      if (worker.id === workerId) {
        return worker;
      }
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
    const sum = this.jobDurations.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.jobDurations.length);
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

  // Public getters for stats
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

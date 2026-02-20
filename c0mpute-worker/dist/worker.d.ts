interface WorkerOptions {
    token: string;
    orchestratorUrl?: string;
    modelPath?: string;
    benchmarkOnly?: boolean;
}
/**
 * Main worker lifecycle: download model, benchmark, connect, and serve jobs.
 */
export declare function startWorker(options: WorkerOptions): Promise<void>;
export {};

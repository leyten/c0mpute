interface WorkerOptions {
    token: string;
    orchestratorUrl?: string;
    benchmarkOnly?: boolean;
    mode?: 'max' | 'image';
}
/**
 * Main worker lifecycle: ensure ollama setup, benchmark, connect, and serve jobs.
 */
export declare function startWorker(options: WorkerOptions): Promise<void>;
export {};

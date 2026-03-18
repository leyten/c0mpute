#!/usr/bin/env node
import { Command } from 'commander';
import { startWorker } from './worker.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const program = new Command();
program
    .name('c0mpute-worker')
    .description('Native worker for the c0mpute.ai distributed inference network')
    .version(pkg.version)
    .requiredOption('--token <token>', 'Authentication token from c0mpute.ai')
    .option('--url <url>', 'Orchestrator URL', 'https://c0mpute.ai')
    .option('--benchmark', 'Run benchmark only, then exit')
    .action(async (opts) => {
    console.log(`c0mpute worker v${pkg.version}`);
    try {
        await startWorker({
            token: opts.token,
            orchestratorUrl: opts.url,
            benchmarkOnly: opts.benchmark || false,
        });
    }
    catch (err) {
        console.error(`Fatal: ${err.message}`);
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map
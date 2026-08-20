// Multi-GPU supervisor: one worker process per card, no flags required.
//
// Ollama loads a model that fits into a SINGLE GPU, so one worker only ever
// drives one card — an 8-GPU rig would leave 7 idle. Rather than teach the
// worker to juggle several ollama daemons in-process, the CLI re-executes
// ITSELF once per card through the existing `--gpu N` path, which already gives
// each child its own ollama port, VRAM detection pinned to its own card, and a
// promise never to kill a sibling's daemon. The parent only supervises: it owns
// no ollama, no socket, and no model.
import { spawn, ChildProcess } from 'child_process';
import { Readable } from 'stream';

export interface SupervisorOptions {
  /** Card indexes to run, in start order. */
  gpus: number[];
  token: string;
  url: string;
}

// The first child prints one of these once its ollama has the model built and
// resident. Only then is it safe to start the others: ollama daemons sharing one
// model directory have no cross-process lock on a pull, so simultaneous
// first-run downloads of the same blob interleave into a single partial file and
// fail the digest check. `Model: <label> (<modelName>)` — the CLI's own echo —
// deliberately does not match; only setup.ts's ready/created/rebuilt lines do.
const READY = /^(Model: .+\((?:ready|created|rebuilt)\)$|Benchmark: )/;

/** Cap on the first-run model download before the rest start anyway. */
const FIRST_READY_TIMEOUT_MS = 90 * 60_000;

/** Fixed backoff after a child exits. Long enough that a crash-looping card
 *  (bad driver, wedged GPU) can't spin the CPU or spam registrations. */
const RESTART_DELAY_MS = 30_000;

export function startGpuSupervisor(o: SupervisorOptions): void {
  const children = new Map<number, ChildProcess>();
  let stopping = false;

  function spawnChild(gpu: number, onLine?: (line: string) => void): void {
    // Re-exec THIS cli: same interpreter and same exec flags (so a `tsx` dev run
    // keeps its loader), same script, plus the flags that make the child
    // non-interactive — it must never re-prompt for the mode.
    const args = [
      ...process.execArgv,
      process.argv[1],
      '--token', o.token,
      '--url', o.url,
      '--mode', 'max',
      '--gpu', String(gpu),
    ];
    const child = spawn(process.execPath, args, {
      env: { ...process.env, C0MPUTE_GPU_CHILD: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.set(gpu, child);
    relay(child.stdout, gpu, onLine);
    relay(child.stderr, gpu, undefined);

    child.on('error', (err) => console.log(`[gpu ${gpu}] failed to start: ${err.message}`));
    child.on('exit', (code, signal) => {
      children.delete(gpu);
      if (stopping) return;
      console.log(
        `[gpu ${gpu}] worker exited (${signal || `code ${code}`}) — restarting in ${RESTART_DELAY_MS / 1000}s`
      );
      setTimeout(() => { if (!stopping) spawnChild(gpu, onLine); }, RESTART_DELAY_MS);
    });
  }

  // Prefix every child line with its card so eight workers share one terminal.
  function relay(stream: Readable | null, gpu: number, onLine?: (line: string) => void): void {
    if (!stream) return;
    let buf = '';
    let lastPartial = 0;
    stream.setEncoding('utf8');
    stream.on('data', (chunk: string) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        // A completed line can still carry the carriage-return progress that ran
        // ahead of it; only the last segment is what a terminal would show. Strip
        // a CRLF terminator first so Windows children don't relay as blank.
        const clean = line.replace(/\r$/, '');
        emit(clean.slice(clean.lastIndexOf('\r') + 1));
      }
      // Download progress is carriage-return updates that carry no newline for
      // minutes at a time. Surface the newest one every couple of seconds so a
      // 17GB pull doesn't look hung, without relaying thousands of percent ticks.
      if (buf.includes('\r') && Date.now() - lastPartial > 2000) {
        const last = buf.split('\r').filter((s) => s.trim()).pop();
        if (last) emit(last);
        lastPartial = Date.now();
        buf = '';
      }
    });
    function emit(line: string): void {
      if (!line.trim()) return;
      console.log(`[gpu ${gpu}] ${line}`);
      onLine?.(line);
    }
  }

  const [first, ...rest] = o.gpus;
  let restStarted = false;
  let readyTimer: NodeJS.Timeout | undefined;

  function startRest(why: string): void {
    if (restStarted || stopping) return;
    restStarted = true;
    if (readyTimer) clearTimeout(readyTimer);
    if (!rest.length) return;
    console.log(`GPU ${first} ${why} — starting GPU ${rest.join(', ')}.`);
    for (const gpu of rest) spawnChild(gpu);
  }

  if (rest.length) {
    console.log(`Starting GPU ${first} first; the others follow once the model is on disk (first run only).`);
  }
  spawnChild(first, (line) => { if (READY.test(line)) startRest('is ready'); });
  if (rest.length) {
    readyTimer = setTimeout(() => startRest('is taking too long'), FIRST_READY_TIMEOUT_MS);
  }

  // The parent outlives its children by design: a card that dies gets restarted,
  // and only an operator signal stops the rig. Children are in our process group,
  // so a terminal Ctrl-C already reaches them; the explicit kill covers
  // `systemctl stop` / `kill <parent>`, where it wouldn't.
  function shutdown(signal: NodeJS.Signals): void {
    if (stopping) return;
    stopping = true;
    console.log(`Stopping ${children.size} GPU worker(s)...`);
    for (const child of children.values()) {
      try { child.kill(signal); } catch { /* already gone */ }
    }
    setTimeout(() => process.exit(0), 5000);
  }
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

import {
  OLLAMA_URL,
  OLLAMA_MODEL,
  OLLAMA_BASE_MODEL,
  SYSTEM_PROMPT,
} from './config.js';
import { checkOllama, modelExists } from './inference.js';

// Parameters baked into the custom model. Change any of these and updated
// workers automatically rebuild their local model to match — no manual
// `ollama rm` needed (see modelConfigCurrent).
const MODEL_PARAMETERS: Record<string, number> = {
  temperature: 0.6,
  top_k: 20,
  top_p: 0.95,
  num_gpu: 999,     // Force GPU offloading — ollama bug #3732: derived models lose GPU layers
  num_ctx: 8192,    // 16384 + 27B weights overflow 24GB VRAM → sysmem fallback → ~4 tok/s
};

/**
 * Ensure ollama is installed, running, and the c0mpute-max model is available.
 */
export async function ensureSetup(): Promise<void> {
  // Check ollama is running
  const running = await checkOllama();
  if (!running) {
    console.error(
      'Ollama is not running. Please install and start ollama first:\n' +
      '  curl -fsSL https://ollama.com/install.sh | sh\n' +
      '  ollama serve'
    );
    process.exit(1);
  }

  console.log('Ollama: connected');

  // Check if our custom model exists
  const exists = await modelExists();
  if (exists) {
    if (await modelConfigCurrent()) {
      console.log(`Model: ${OLLAMA_MODEL} (ready)`);
      return;
    }
    // A newer worker version changed the model config — rebuild from the
    // already-present base model (no multi-GB re-download).
    console.log(`Model: ${OLLAMA_MODEL} config out of date — rebuilding...`);
    await createModel();
    console.log(`Model: ${OLLAMA_MODEL} (rebuilt)`);
    return;
  }

  // Need to create the model — first pull the base model
  console.log(`Pulling base model: ${OLLAMA_BASE_MODEL}`);
  console.log('This may take a while on first run (~17GB download)...');

  const pullRes = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: OLLAMA_BASE_MODEL, stream: true }),
  });

  if (!pullRes.ok) {
    throw new Error(`Failed to pull model: ${pullRes.status}`);
  }

  // Stream pull progress
  if (pullRes.body) {
    const reader = pullRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastStatus = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.status && data.status !== lastStatus) {
            if (data.total && data.completed) {
              const pct = Math.round((data.completed / data.total) * 100);
              process.stdout.write(`\r  ${data.status}: ${pct}%`);
            } else {
              console.log(`  ${data.status}`);
            }
            lastStatus = data.status;
          } else if (data.total && data.completed) {
            const pct = Math.round((data.completed / data.total) * 100);
            process.stdout.write(`\r  ${lastStatus}: ${pct}%`);
          }
          if (data.error) {
            throw new Error(`Pull error: ${data.error}`);
          }
        } catch (e: any) {
          if (e.message?.startsWith('Pull error')) throw e;
        }
      }
    }
    console.log(''); // newline after progress
  }

  // Create custom model from base model
  await createModel();

  // Verify
  const verify = await modelExists();
  if (!verify) {
    throw new Error('Model creation succeeded but model not found');
  }

  console.log(`Model: ${OLLAMA_MODEL} (created)`);
}

/** Create (or overwrite) the custom model from the base model. */
async function createModel(): Promise<void> {
  console.log(`Creating model: ${OLLAMA_MODEL}`);

  const createRes = await fetch(`${OLLAMA_URL}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      from: OLLAMA_BASE_MODEL,
      system: SYSTEM_PROMPT,
      parameters: MODEL_PARAMETERS,
      stream: false,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create model: ${text}`);
  }
}

/**
 * Whether the existing model's parameters already match MODEL_PARAMETERS.
 * Reads them back via /api/show, whose `parameters` field is a newline-
 * separated "name   value" list. Compared numerically so formatting
 * differences don't trigger a needless rebuild. On any error, returns false
 * (triggering a safe rebuild from the already-present base model).
 */
async function modelConfigCurrent(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: OLLAMA_MODEL }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const paramStr: string = typeof data.parameters === 'string' ? data.parameters : '';

    const current: Record<string, string> = {};
    for (const line of paramStr.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const sep = trimmed.search(/\s/);
      if (sep === -1) continue;
      current[trimmed.slice(0, sep)] = trimmed.slice(sep).trim();
    }

    for (const [key, value] of Object.entries(MODEL_PARAMETERS)) {
      if (current[key] === undefined || parseFloat(current[key]) !== value) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

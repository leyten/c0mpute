import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
  OLLAMA_URL,
  OLLAMA_MODEL,
  OLLAMA_BASE_MODEL,
  MODELFILE_TEMPLATE,
  DATA_DIR,
} from './config.js';
import { checkOllama, modelExists } from './inference.js';

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
    console.log(`Model: ${OLLAMA_MODEL} (ready)`);
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

  // Write Modelfile and create custom model
  console.log(`Creating model: ${OLLAMA_MODEL}`);
  mkdirSync(DATA_DIR, { recursive: true });
  const modelfilePath = join(DATA_DIR, 'Modelfile');
  writeFileSync(modelfilePath, MODELFILE_TEMPLATE);

  const createRes = await fetch(`${OLLAMA_URL}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: OLLAMA_MODEL,
      modelfile: MODELFILE_TEMPLATE,
      stream: false,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`Failed to create model: ${text}`);
  }

  // Verify
  const verify = await modelExists();
  if (!verify) {
    throw new Error('Model creation succeeded but model not found');
  }

  console.log(`Model: ${OLLAMA_MODEL} (created)`);
}

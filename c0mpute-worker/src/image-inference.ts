import { COMFY_URL, IMAGE_GEN_TIMEOUT_MS } from './config.js';

// Execute an image workflow on the local ComfyUI and return the PNG as base64.
//
// The worker is deliberately "dumb": the orchestrator hands it the full ComfyUI
// graph (built centrally from c0mpute's model + anti-slop defaults), so every
// worker produces identical output and the recipe can change without
// redeploying workers. Here we just submit, poll, and fetch the result.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jget(path: string, signal?: AbortSignal): Promise<any> {
  const res = await fetch(`${COMFY_URL}${path}`, { signal });
  if (!res.ok) throw new Error(`ComfyUI GET ${path} -> ${res.status}`);
  return res.json();
}

/** Run one workflow. Returns base64 PNG (no data: prefix). Throws on failure/timeout. */
export async function runImageJob(workflow: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
  const clientId = `c0mpute-img-${Math.random().toString(36).slice(2)}`;

  const submit = await fetch(`${COMFY_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal,
  });
  if (!submit.ok) {
    const t = await submit.text().catch(() => '');
    throw new Error(`ComfyUI rejected workflow (${submit.status}): ${t.slice(0, 300)}`);
  }
  const { prompt_id: promptId } = await submit.json();
  if (!promptId) throw new Error('ComfyUI did not return a prompt_id.');

  const deadline = Date.now() + IMAGE_GEN_TIMEOUT_MS;
  let outputs: any = null;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
    await sleep(1000);
    let hist: any;
    try {
      hist = await jget(`/history/${promptId}`, signal);
    } catch {
      continue;
    }
    const entry = hist?.[promptId];
    if (entry?.outputs) { outputs = entry.outputs; break; }
    if (entry?.status?.status_str === 'error') {
      throw new Error('ComfyUI reported an execution error for this job.');
    }
  }
  if (!outputs) throw new Error('Image generation timed out.');

  let image: { filename: string; subfolder: string; type: string } | null = null;
  for (const nodeId of Object.keys(outputs)) {
    const imgs = outputs[nodeId]?.images;
    if (Array.isArray(imgs) && imgs.length) { image = imgs[0]; break; }
  }
  if (!image) throw new Error('No image in ComfyUI output.');

  const q = new URLSearchParams({ filename: image.filename, subfolder: image.subfolder || '', type: image.type || 'output' });
  const view = await fetch(`${COMFY_URL}/view?${q.toString()}`, { signal });
  if (!view.ok) throw new Error(`ComfyUI /view -> ${view.status}`);
  const buf = Buffer.from(await view.arrayBuffer());
  return buf.toString('base64');
}

/** Quick reachability probe. */
export async function comfyOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFY_URL}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { COMFY_URL, COMFY_DIR as COMFY_DIR_ENV, VIDEO_GEN_TIMEOUT_MS, MAX_VIDEO_B64_CHARS } from './config.js';

// Execute a text-to-video workflow on the local ComfyUI and return the MP4 as
// base64. Same "dumb worker" contract as image-inference.ts: the orchestrator
// sends the whole graph and names its SaveVideo node; here we submit, report
// progress, poll for completion and fetch the file.

const COMFY_OUT_BASE = COMFY_DIR_ENV || join(homedir(), '.c0mpute', 'ComfyUI');

/** Stages the orchestrator accepts (lib/orchestrator/types.ts VIDEO_STAGES). */
export type VideoStage = 'loading' | 'sampling' | 'decoding' | 'interpolating' | 'encoding';
export type OnProgress = (pct: number, stage: VideoStage) => void;

export type GraphNode = { class_type?: string; inputs?: Record<string, unknown> };
type OutputFile = { filename: string; subfolder?: string; type?: string };
type NodeOutput = { images?: OutputFile[]; gifs?: OutputFile[]; videos?: OutputFile[] };
type HistoryEntry = {
  status?: { status_str?: string; messages?: [string, { node_type?: string; exception_message?: string }][] };
  outputs?: Record<string, NodeOutput>;
};

// Node types every Wan text-to-video graph is built from. Checked before
// registering so a ComfyUI that cannot render video never takes a paid job.
const REQUIRED_NODES = ['UNETLoader', 'CLIPLoader', 'VAELoader', 'CLIPTextEncode', 'EmptyHunyuanLatentVideo', 'KSamplerAdvanced', 'VAEDecode', 'CreateVideo', 'SaveVideo'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pre-register self-check: ComfyUI answers and has the video nodes. Not a
 *  render (that takes minutes). Returns what is wrong, or null if all is well. */
export async function checkVideoComfy(): Promise<string | null> {
  let info: Record<string, unknown>;
  try {
    const res = await fetch(`${COMFY_URL}/object_info`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return `ComfyUI at ${COMFY_URL} answered /object_info with HTTP ${res.status}`;
    info = await res.json();
  } catch (e) {
    return `ComfyUI is not reachable at ${COMFY_URL} (${e instanceof Error ? e.message : e})`;
  }
  const missing = REQUIRED_NODES.filter((n) => !(n in info));
  return missing.length ? `ComfyUI is missing node types ${missing.join(', ')} (update ComfyUI)` : null;
}

function stageOf(classType = ''): VideoStage | undefined {
  if (/Loader/.test(classType)) return 'loading';
  if (/KSampler|SamplerCustom/.test(classType)) return 'sampling';
  if (/^VAEDecode/.test(classType)) return 'decoding';
  if (/FrameInterpolat|RIFE/i.test(classType)) return 'interpolating';
  if (/CreateVideo|SaveVideo/.test(classType)) return 'encoding';
  return undefined;
}

// Sampler steps a node runs: KSamplerAdvanced splits one schedule across
// several nodes with start/end steps. Sampling is ~all of the render time, so
// overall progress is steps done over steps in the graph.
function samplerSteps(node: GraphNode): number {
  const i = node.inputs || {};
  const steps = Number(i.steps) || 0;
  if (node.class_type === 'KSamplerAdvanced') {
    return Math.max(0, Math.min(steps, Number(i.end_at_step ?? steps)) - (Number(i.start_at_step) || 0));
  }
  return /KSampler/.test(node.class_type || '') ? steps : 0;
}

type WsLike = { onmessage: ((ev: { data: unknown }) => void) | null; onerror: (() => void) | null; close(): void };

// Progress from ComfyUI's websocket, best effort: it needs the WebSocket
// global (Node 22+), and completion never depends on it (/history does that).
// ComfyUI sends execution events only to the client id that queued the
// prompt, so every message on this socket is ours.
function watchProgress(clientId: string, workflow: Record<string, GraphNode>, onProgress: OnProgress): () => void {
  const WS = (globalThis as unknown as { WebSocket?: new (url: string) => WsLike }).WebSocket;
  if (typeof WS !== 'function') return () => {};
  let ws: WsLike;
  try {
    ws = new WS(`${COMFY_URL.replace(/^http/, 'ws')}/ws?clientId=${encodeURIComponent(clientId)}`);
  } catch {
    return () => {};
  }
  const weight = new Map<string, number>();
  for (const [id, node] of Object.entries(workflow)) {
    const n = samplerSteps(node);
    if (n > 0) weight.set(id, n);
  }
  const total = [...weight.values()].reduce((a, b) => a + b, 0);
  const done = new Map<string, number>();
  let last = 0;
  const emit = (pct: number, stage: VideoStage) => { last = Math.max(last, Math.round(pct)); onProgress(last, stage); };

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') return; // binary frames are previews
    let msg: { type?: string; data?: { node?: string | null; value?: number; max?: number } };
    try { msg = JSON.parse(ev.data); } catch { return; }
    const d = msg.data || {};
    if (msg.type === 'executing' && d.node) {
      const stage = stageOf(workflow[d.node]?.class_type);
      const floor = { loading: 2, sampling: last, decoding: 90, interpolating: 93, encoding: 97 } as const;
      if (stage) emit(floor[stage], stage);
    } else if (msg.type === 'progress' && d.node && weight.has(d.node) && total > 0) {
      const w = weight.get(d.node)!;
      done.set(d.node, w * Math.min(1, (Number(d.value) || 0) / (Number(d.max) || 1)));
      const sum = [...done.values()].reduce((a, b) => a + b, 0);
      emit(5 + (85 * sum) / total, 'sampling');
    }
  };
  ws.onerror = () => {};
  return () => { try { ws.close(); } catch { /* ignore */ } };
}

/** Run one workflow. Returns base64 MP4 (no data: prefix). Throws on failure/timeout. */
export async function runVideoJob(
  workflow: Record<string, GraphNode>,
  outputNode: string | undefined,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<string> {
  const clientId = `c0mpute-vid-${Math.random().toString(36).slice(2)}`;
  const stopWatching = watchProgress(clientId, workflow, onProgress);
  let promptId: string | undefined;
  try {
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
    promptId = (await submit.json()).prompt_id;
    if (!promptId) throw new Error('ComfyUI did not return a prompt_id.');

    const deadline = Date.now() + VIDEO_GEN_TIMEOUT_MS;
    let outputs: Record<string, NodeOutput> | null = null;
    while (Date.now() < deadline) {
      if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      await sleep(2000);
      let entry: HistoryEntry | undefined;
      try {
        const res = await fetch(`${COMFY_URL}/history/${promptId}`, { signal });
        if (!res.ok) continue;
        entry = (await res.json())?.[promptId];
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') throw e;
        continue;
      }
      if (!entry) continue;
      const st = entry.status || {};
      const execErr = (st.messages || []).find((m) => m?.[0] === 'execution_error');
      if (execErr || st.status_str === 'error') {
        const d = execErr?.[1] || {};
        const detail = d.exception_message ? `${d.node_type || 'node'}: ${d.exception_message}` : (st.status_str || 'execution error');
        throw new Error('ComfyUI render error: ' + String(detail).slice(0, 400));
      }
      if (entry.outputs && Object.keys(entry.outputs).length) { outputs = entry.outputs; break; }
    }
    if (!outputs) throw new Error('Video generation timed out.');

    // SaveVideo reports its file under `images`, like SaveImage does.
    const pick = (o?: NodeOutput) => o?.images?.[0] || o?.gifs?.[0] || o?.videos?.[0];
    const file = (outputNode && pick(outputs[outputNode])) || Object.values(outputs).map(pick).find(Boolean);
    if (!file) throw new Error('render completed but produced no video (check ComfyUI logs)');

    // Fetch it now: the box may clean old outputs up on its own schedule.
    const q = new URLSearchParams({ filename: file.filename, subfolder: file.subfolder || '', type: file.type || 'output' });
    const view = await fetch(`${COMFY_URL}/view?${q.toString()}`, { signal });
    if (!view.ok) throw new Error(`ComfyUI /view -> ${view.status}`);
    const b64 = Buffer.from(await view.arrayBuffer()).toString('base64');

    // Privacy: delete the clip from ComfyUI's output folder once we have it,
    // when ComfyUI is local. Best effort.
    try {
      const fp = join(COMFY_OUT_BASE, file.type === 'temp' ? 'temp' : 'output', file.subfolder || '', file.filename);
      if (existsSync(fp)) unlinkSync(fp);
    } catch { /* ignore */ }

    if (b64.length > MAX_VIDEO_B64_CHARS) {
      throw new Error(`clip is ${(b64.length / 1048576).toFixed(1)}MB as base64, over the ${MAX_VIDEO_B64_CHARS / 1048576}MB the network carries`);
    }
    return b64;
  } catch (err) {
    // Cancelled or timed out: stop the GPU work too, or ComfyUI keeps
    // rendering a clip nobody will collect and the next job queues behind it.
    const e = err as Error;
    if (promptId && (e?.name === 'AbortError' || /timed out/.test(e?.message || ''))) {
      fetch(`${COMFY_URL}/queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [promptId] }) }).catch(() => {});
      fetch(`${COMFY_URL}/interrupt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt_id: promptId }) }).catch(() => {});
    }
    throw err;
  } finally {
    stopWatching();
  }
}

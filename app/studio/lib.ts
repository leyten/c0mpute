// Studio client state that outlives a render or a reload: the clip history in
// IndexedDB, the renders in flight in localStorage, and the timing this
// browser has measured. The server keeps nothing, so this is the only copy.

import type { VideoStage } from '@/lib/orchestrator/types';

export const VIDEO_CREDITS = 250; // keep in sync with lib/video-gen VIDEO_CREDITS
export const MAX_ACTIVE = 2; // the server's per-account cap (lib/orchestrator MAX_VIDEO_JOBS_PER_USER)
export const NSFW_ACK_KEY = 'c0mpute_nsfw_ack'; // shared with /create: one 18+ confirmation covers both
export const POLL_MS = 3000;
// Past this a render is over one way or another (up to 15 minutes queued, 15
// rendering, then the server holds a finished clip for an hour), so a page
// left open stops asking.
export const PENDING_MAX_MS = 90 * 60_000;
const DEFAULT_RENDER_MS = 150_000;

// The sizes the server's workflow manifests allow; anything else falls back to the first.
export const ASPECTS = [
  { id: 'landscape', label: 'Landscape', ratio: '16:9', w: 1280, h: 720 },
  { id: 'portrait', label: 'Portrait', ratio: '9:16', w: 720, h: 1280 },
  { id: 'square', label: 'Square', ratio: '1:1', w: 960, h: 960 },
] as const;
export type AspectId = (typeof ASPECTS)[number]['id'];

export const SUGGESTED_PROMPTS = [
  { label: 'Lighthouse at dusk', prompt: 'A lighthouse on a cliff at dusk, waves crashing below, slow aerial push in, cinematic' },
  { label: 'Neon rain', prompt: 'Rain on a neon-lit Tokyo street at night, reflections in puddles, handheld camera' },
  { label: 'Fox in snow', prompt: 'A red fox trotting through fresh snow in a pine forest, soft morning light, telephoto' },
  { label: 'Coffee pour', prompt: 'Close up of iced coffee being poured into a glass, cream swirling, studio lighting, slow motion' },
];

// ── history (IndexedDB) ─────────────────────────────────────────────────────
// Version 1 records ({ id, blob, prompt, seed?, width, height, createdAt }) are
// still valid: the fields added since (adult, renderMs) are optional, so old
// clips simply show without an 18+ badge or a render time.
export interface SavedVideo {
  id: string;
  blob: Blob;
  prompt: string;
  seed?: number;
  width: number;
  height: number;
  createdAt: number;
  adult?: boolean;
  renderMs?: number;
}
// `url` is an object URL for the blob, revoked when the clip leaves the page.
export interface ShownVideo extends SavedVideo { url: string; }

const IDB_NAME = 'c0mpute-studio';
const IDB_STORE = 'videos';
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(IDB_STORE)) r.result.createObjectStore(IDB_STORE, { keyPath: 'id' }); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function idbAll(): Promise<SavedVideo[]> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).getAll();
    req.onsuccess = () => resolve(((req.result as SavedVideo[]) || []).sort((a, b) => b.createdAt - a.createdAt));
    req.onerror = () => reject(req.error);
  });
}
export async function idbPut(rec: SavedVideo): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function idbDelete(id: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── renders in flight (localStorage) ────────────────────────────────────────
// Up to two at once. The key used to hold a single job object; an old value
// of that shape is read as a list of one.
export interface PendingJob {
  jobId: string;
  prompt: string;
  seed?: number;
  // The seed was chosen by the user, so "Try again" keeps it.
  seedPinned?: boolean;
  width: number;
  height: number;
  adult?: boolean;
  startedAt: number;
}
const PENDING_KEY = 'c0mpute_studio_pending';

export function readPending(): PendingJob[] {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null') as PendingJob | PendingJob[] | null;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.filter((p) => p?.jobId && Date.now() - p.startedAt < PENDING_MAX_MS).slice(0, MAX_ACTIVE);
  } catch {
    return [];
  }
}
export function writePending(list: PendingJob[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}
export function removePending(jobId: string) {
  writePending(readPending().filter((p) => p.jobId !== jobId));
}

// ── what this browser has measured ──────────────────────────────────────────
const RENDER_MS_KEY = 'c0mpute_studio_render_ms';
/** Rolling average of this browser's last five renders, submit to clip. */
export function expectedRenderMs(): number {
  try {
    const xs = JSON.parse(localStorage.getItem(RENDER_MS_KEY) || '[]') as number[];
    const ok = xs.filter((x) => Number.isFinite(x) && x > 10_000 && x < 3_600_000);
    return ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : DEFAULT_RENDER_MS;
  } catch {
    return DEFAULT_RENDER_MS;
  }
}
export function recordRenderMs(ms: number) {
  try {
    const xs = JSON.parse(localStorage.getItem(RENDER_MS_KEY) || '[]') as number[];
    localStorage.setItem(RENDER_MS_KEY, JSON.stringify([...xs, ms].slice(-5)));
  } catch {}
}

// ── a job on the canvas ─────────────────────────────────────────────────────
export interface JobState extends PendingJob {
  status: 'queued' | 'rendering' | 'failed';
  pct: number;
  stage?: VideoStage;
  error?: string;
}

/** Honest progress: the worker's own percentage when it reports one, else
 *  elapsed over what this browser usually waits. Never a creeping 99%: past
 *  95 the number goes and the label says Finishing. */
export function progressOf(job: JobState, now: number, expectedMs: number) {
  const elapsed = Math.max(0, now - job.startedAt);
  const estimate = Math.min(95, (elapsed / expectedMs) * 100);
  const pct = job.status === 'rendering' && job.pct > 0 ? job.pct : job.status === 'queued' ? 0 : estimate;
  const finishing = pct > 95 || job.stage === 'interpolating' || job.stage === 'encoding';
  const label = job.status === 'queued'
    ? 'Queued'
    : finishing ? 'Finishing'
      : job.stage === 'loading' ? 'Loading model'
        : job.stage === 'decoding' ? 'Decoding'
          : 'Rendering';
  const remaining = job.pct > 5 ? (elapsed * (100 - job.pct)) / job.pct : expectedMs - elapsed;
  return {
    elapsed,
    pct: finishing ? null : Math.round(pct),
    barPct: finishing ? 100 : pct,
    label,
    slow: elapsed > 2 * expectedMs,
    remaining: remaining > 0 ? remaining : 0,
  };
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
export function fmtRemaining(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 45) return 'under a minute left';
  const m = Math.round(s / 60);
  return `about ${m} min left`;
}
export function aspectIdFor(w: number, h: number): AspectId {
  return w > h ? 'landscape' : h > w ? 'portrait' : 'square';
}

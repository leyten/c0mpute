/**
 * Shard model registry — the consumer side of the ONE signed model registry (M1).
 *
 * shard/registry.py (Python) PRODUCES the signed `shard-models/1` registry; this module
 * CONSUMES it. A model is defined exactly once (shard's registry/models.json) and BOTH repos
 * read it, killing the drift class that gave us gpt-oss 120-vs-36: the layer count, bytes/layer,
 * quant, engine path, tokenizer and adapter no longer live in three places.
 *
 * Trust model (identical to lib/receipt.ts + shard/manifest.py): the registry is signed with
 * the publisher's ed25519 key; we pin the expected pubkey and FAIL CLOSED on any mismatch,
 * bad signature, unknown schema, or malformed row. A mirror cannot swap in its own registry.
 *
 * ZERO NEW DEPS: node:crypto for ed25519 (same SPKI path as lib/identity.ts / lib/receipt.ts).
 *
 * Canonicalization MUST match shard/manifest.py canonical() EXACTLY:
 *   json.dumps(reg \\ "signature", sort_keys=True, separators=(",",":"), ensure_ascii=False)
 * The registry is NESTED (models[] of objects, each with a defaults{} object), so unlike the
 * flat receipt we must sort keys RECURSIVELY — Python's sort_keys=True sorts every nested
 * object's keys, and arrays keep their order. canonicalize() below mirrors that.
 */
import { createPublicKey, verify as edVerify } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REGISTRY_SCHEMA = 'shard-models/1';

// Adapters the runtime can instantiate (M3). Mirror of shard/registry.py KNOWN_ADAPTERS —
// the cross-repo CI test (registryCrossRepo.test.ts) asserts these two sets are identical so
// they can't drift either.
export const KNOWN_ADAPTERS = new Set(['glm-nvfp4', 'generic-vllm']);

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RegistryError';
  }
}

/** One model row. Superset of the old ShardModelSpec — adds the M3/M4 fields. */
export interface ModelEntry {
  id: string;             // user-facing model id (job:submit `model`)
  hfArch: string;         // config.architectures[0] — keys the generic adapter
  workerModel: string;    // the `model` string shard workers register with
  enginePath: string;     // path the specpipe stages load on the worker box
  layerCount: number;     // transformer layers — receipts MUST tile [0:layerCount]
  gbPerLayer: number;     // model bytes/layer at the served quant (VRAM fit)
  kvGbPerLayer: number;   // KV bytes/layer at target ctx (VRAM fit)
  quant: string;          // nvfp4 | mxfp4 | fp8 | ...
  adapter: string;        // StageRuntime impl (M3): glm-nvfp4 | generic-vllm
  tokenizerId: string;    // tokenizer the coordinator formats/detokenizes with
  chatTemplate?: string | null;
  weightManifestCid?: string;
  defaults?: { K?: number; depth?: number; draftCtx?: number };
}

export interface ModelRegistry {
  schema: string;
  version: number;
  models: ModelEntry[];
  publisher_pubkey: string;
  signature: string;
}

const REQUIRED_FIELDS: (keyof ModelEntry)[] = [
  'id', 'hfArch', 'workerModel', 'enginePath',
  'layerCount', 'gbPerLayer', 'kvGbPerLayer', 'quant', 'adapter', 'tokenizerId',
];

/**
 * Recursively key-sorted, whitespace-free JSON — matches Python json.dumps(sort_keys=True,
 * separators=(",",":"), ensure_ascii=False). Objects get sorted keys at every depth; arrays
 * keep order; scalars pass through. The "signature" field is dropped at the top level only
 * (that's what the publisher signs over).
 */
function canonicalize(value: unknown, dropSignature = false): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => !(dropSignature && k === 'signature')).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

/** Bytes the publisher signed over: the registry minus "signature", canonical form. */
export function canonicalBytes(registry: Record<string, unknown>): Buffer {
  return Buffer.from(canonicalize(registry, true), 'utf-8');
}

function verifySignature(registry: ModelRegistry, expectedPubkey?: string): void {
  const pubB64 = registry.publisher_pubkey;
  const sigB64 = registry.signature;
  if (!pubB64 || !sigB64) throw new RegistryError('registry is unsigned');
  if (expectedPubkey !== undefined && pubB64 !== expectedPubkey) {
    throw new RegistryError('publisher pubkey does not match the pinned key');
  }
  if (registry.schema !== REGISTRY_SCHEMA) {
    throw new RegistryError(`unknown registry schema ${JSON.stringify(registry.schema)}`);
  }
  try {
    const rawPub = Buffer.from(pubB64, 'base64');
    if (rawPub.length !== 32) throw new RegistryError(`bad pubkey length ${rawPub.length}`);
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), rawPub]);
    const pub = createPublicKey({ key: der, format: 'der', type: 'spki' });
    const sig = Buffer.from(sigB64, 'base64');
    const ok = edVerify(null, canonicalBytes(registry as unknown as Record<string, unknown>), pub, sig);
    if (!ok) throw new RegistryError('signature verification failed');
  } catch (e) {
    if (e instanceof RegistryError) throw e;
    throw new RegistryError(`signature verification failed: ${(e as Error).name}`);
  }
}

function validateRows(registry: ModelRegistry): void {
  if (registry.schema !== REGISTRY_SCHEMA) {
    throw new RegistryError(`unknown registry schema ${JSON.stringify(registry.schema)}`);
  }
  if (!Array.isArray(registry.models) || registry.models.length === 0) {
    throw new RegistryError('registry has no models');
  }
  const seen = new Set<string>();
  for (const m of registry.models) {
    if (!m.id) throw new RegistryError('model row missing id');
    if (seen.has(m.id)) throw new RegistryError(`duplicate model id ${m.id}`);
    seen.add(m.id);
    for (const f of REQUIRED_FIELDS) {
      const v = m[f];
      if (v === undefined || v === null || v === '') {
        throw new RegistryError(`model ${m.id} missing required field ${String(f)}`);
      }
    }
    if (!Number.isInteger(m.layerCount) || m.layerCount <= 0) {
      throw new RegistryError(`model ${m.id} layerCount must be a positive int, got ${m.layerCount}`);
    }
    if (!KNOWN_ADAPTERS.has(m.adapter)) {
      throw new RegistryError(`model ${m.id} names unknown adapter ${m.adapter}`);
    }
  }
}

/**
 * Verify a parsed registry: signature (+ pinned pubkey) AND every row structurally sound.
 * Fail closed. Mirror of shard/registry.py verify_registry.
 */
export function verifyRegistry(registry: ModelRegistry, expectedPubkey?: string): void {
  verifySignature(registry, expectedPubkey);
  validateRows(registry);
}

/** Parse + verify a registry from a JSON string. */
export function parseRegistry(json: string, expectedPubkey?: string): ModelRegistry {
  let reg: ModelRegistry;
  try {
    reg = JSON.parse(json) as ModelRegistry;
  } catch (e) {
    throw new RegistryError(`registry is not valid JSON: ${(e as Error).message}`);
  }
  verifyRegistry(reg, expectedPubkey);
  return reg;
}

/** Read + verify a registry from a file path (dev/CI). */
export function loadRegistryFromFile(path: string, expectedPubkey?: string): ModelRegistry {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch (e) {
    throw new RegistryError(`registry not found at ${path}: ${(e as Error).message}`);
  }
  return parseRegistry(raw, expectedPubkey);
}

/** {id -> ModelEntry} for O(1) lookup. */
export function modelsById(registry: ModelRegistry): Record<string, ModelEntry> {
  return Object.fromEntries(registry.models.map((m) => [m.id, m]));
}

// ── cached singleton accessor (the orchestrator hot path) ──────────────────────
// The orchestrator calls getShardModelSpec / isShardModel synchronously in queue + payout
// paths, so we keep a module-level cache. Source resolution (first hit wins):
//   1. SHARD_MODELS_JSON  — absolute path to the signed registry (dev/CI, deploy-synced).
//   2. (prod) call refreshRegistryFromUrl() at startup to populate from a CDN URL.
// Pinned pubkey: SHARD_MODELS_PUBKEY (base64). Strongly recommended in prod — without it the
// signature is still checked for internal consistency but not against a trusted publisher.
// Cache invalidates on a TTL OR when the on-disk version bumps (cheap re-read + version cmp).

const TTL_MS = Number(process.env.SHARD_MODELS_TTL_MS || 60_000);
let cached: ModelRegistry | null = null;
let cachedAt = 0;

function pinnedPubkey(): string | undefined {
  return process.env.SHARD_MODELS_PUBKEY || undefined;
}

function defaultPath(): string | undefined {
  return process.env.SHARD_MODELS_JSON || undefined;
}

/**
 * The current registry from cache, refreshing from the configured file source when the cache
 * is empty or older than the TTL. Returns null if no source is configured / load fails —
 * callers (isShardModel) then treat nothing as a ring model (fail safe: no ring dispatch).
 * In prod where the source is a URL, call refreshRegistryFromUrl() once at startup; this
 * file-backed path is the dev/CI source.
 */
export function getRegistry(): ModelRegistry | null {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;
  const path = defaultPath();
  if (!path) return cached; // no file source; rely on a prior refreshRegistryFromUrl()
  try {
    const next = loadRegistryFromFile(path, pinnedPubkey());
    // version bump or first load -> swap; same version -> just touch the timestamp.
    cached = next;
    cachedAt = now;
    return cached;
  } catch (e) {
    // Never throw into the hot path. Keep serving the last good registry if we have one.
    if (!cached) console.error(`[modelRegistry] load failed and no cache: ${(e as Error).message}`);
    cachedAt = now; // back off re-trying every call
    return cached;
  }
}

/** Populate/replace the cache from a remote URL (prod). Verifies + pins like the file path. */
export async function refreshRegistryFromUrl(
  url: string,
  expectedPubkey: string | undefined = pinnedPubkey(),
  fetchImpl: typeof fetch = fetch,
): Promise<ModelRegistry> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new RegistryError(`registry fetch ${res.status}`);
  const reg = parseRegistry(await res.text(), expectedPubkey);
  cached = reg;
  cachedAt = Date.now();
  return reg;
}

/** Inject a registry directly into the cache (tests, or a custom loader). */
export function setRegistryCache(reg: ModelRegistry | null): void {
  cached = reg;
  cachedAt = reg ? Date.now() : 0;
}

/** The model row for a user-facing id, or undefined if it's not a registered ring model. */
export function getModelEntry(modelId?: string): ModelEntry | undefined {
  if (!modelId) return undefined;
  const reg = getRegistry();
  if (!reg) return undefined;
  return reg.models.find((m) => m.id === modelId);
}


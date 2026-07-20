// Generates data-site/network.json for the shard.c0mpute.ai live map. Run by the
// c0mpute-networkmap systemd timer every 5 minutes (the stats.json pattern).
//
// Privacy rule (data-stats.ts's, enforced here AND in network-feed.ts): the published file
// carries truncated PeerId handles and approximate, jittered coordinates — never IPs,
// multiaddrs, subnets, pubkeys or accounts. The dial IP exists only in transit between the
// loopback-gated /api/network and this script's geo step, then is dropped.
import { config } from 'dotenv';
import { resolve, join } from 'path';
import { existsSync, readFileSync, writeFileSync, renameSync, copyFileSync } from 'fs';

const ROOT = resolve(__dirname, '..');
config({ path: join(ROOT, '.env.local') });

const ORCH_URL = process.env.NETWORKMAP_ORCH || 'http://127.0.0.1:3004';  // loopback ⇒ the internal shape (dialIp for geo)
const OUT = join(ROOT, 'data-site', 'network.json');
const WWW = process.env.NETWORKMAP_WWW || '/var/www/shard.c0mpute.ai/network.json';
const GEO_CACHE = join(ROOT, 'data', 'geo-cache.json');
// One-way live latch (leyten 2026-07-20: once the betanet is live, the page must NEVER show the
// sim — an empty network renders as an honest empty globe). Latched the first time real nodes
// appear (or forced via NETWORKMAP_LIVE=1); the marker persists across restarts.
const LIVE_MARKER = join(ROOT, 'data', 'networkmap.live');

interface FeedNode {
  id: string; gpu: string; vramGb: number | null; status: string;
  swarm?: string; stageIdx?: number; stageN?: number; layerLo?: number; layerHi?: number;
  upMbps?: number; uptimeHrs: number; tokensServed: number; receipts: number;
  geoHint?: string; dialIp?: string;
}
interface Geo { lat: number; lon: number; cc: string; city: string }

async function fetchJson(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; } finally { clearTimeout(t); }
}

/** /24-keyed geo cache: one lookup per subnet, ever (nodes churn, subnets repeat). */
function loadCache(): Record<string, Geo> {
  try { return JSON.parse(readFileSync(GEO_CACHE, 'utf8')); } catch { return {}; }
}

async function geolocate(ips: string[], cache: Record<string, Geo>): Promise<void> {
  const need = [...new Set(ips.map((ip) => ip.split('.').slice(0, 3).join('.')))]
    .filter((k) => !cache[k]);
  if (!need.length) return;
  // ip-api.com batch (free, no key, 100/req; only ever called for UNSEEN /24s)
  const body = need.map((k) => ({ query: `${k}.1`, fields: 'status,lat,lon,countryCode,city,query' }));
  const res = await fetchJson('http://ip-api.com/batch', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }) as { status: string; lat: number; lon: number; countryCode: string; city: string; query: string }[] | null;
  for (const r of res ?? []) {
    if (r?.status === 'success') {
      cache[r.query.split('.').slice(0, 3).join('.')] =
        { lat: r.lat, lon: r.lon, cc: r.countryCode, city: r.city };
    }
  }
  const tmp = GEO_CACHE + '.tmp';
  writeFileSync(tmp, JSON.stringify(cache));
  renameSync(tmp, GEO_CACHE);
}

/** Deterministic ±0.15° jitter by node handle, so co-located nodes never stack exactly. */
function jitter(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (const c of id) { h = Math.imul(h ^ c.charCodeAt(0), 16777619); }
  return (((h >>> 0) % 1000) / 1000 - 0.5) * 0.3;
}

async function main() {
  const feed = await fetchJson(`${ORCH_URL}/api/network`);
  if (!feed) { console.log('[network-map] orchestrator unreachable — nothing written'); return; }

  const nodes: FeedNode[] = feed.nodes ?? [];
  const cache = loadCache();
  await geolocate(nodes.map((n) => n.dialIp).filter(Boolean) as string[], cache);

  const placed = nodes.flatMap((n) => {
    const geo = n.dialIp ? cache[n.dialIp.split('.').slice(0, 3).join('.')] : undefined;
    if (!geo) return [];                          // geo-less nodes stay in the stats, not on the globe
    const { dialIp: _drop, geoHint: _hint, ...pub } = n;
    return [{ ...pub, city: geo.city, cc: geo.cc,
      lat: geo.lat + jitter(n.id, 1), lon: geo.lon + jitter(n.id, 2) }];
  });

  if ((nodes.length > 0 || process.env.NETWORKMAP_LIVE === '1') && !existsSync(LIVE_MARKER)) {
    writeFileSync(LIVE_MARKER, new Date().toISOString());
    console.log('[network-map] LIVE latched — the sim never renders again');
  }
  const out = {
    generatedAt: feed.generatedAt, live: existsSync(LIVE_MARKER), layerCount: feed.layerCount,
    stats: { ...feed.stats, countries: new Set(placed.map((p) => p.cc)).size },
    nodes: placed,
    rings: feed.rings ?? [],
  };
  const tmp = OUT + '.tmp';
  writeFileSync(tmp, JSON.stringify(out));
  renameSync(tmp, OUT);                           // atomic: nginx never serves a half file
  if (existsSync(resolve(WWW, '..'))) {
    writeFileSync(WWW + '.tmp', JSON.stringify(out));
    renameSync(WWW + '.tmp', WWW);
  }
  console.log(`[network-map] wrote ${placed.length}/${nodes.length} nodes, `
    + `${out.rings.length} ring(s), ${out.stats.countries} countries`);
}

main().catch((e) => { console.error('[network-map]', e); process.exit(1); });

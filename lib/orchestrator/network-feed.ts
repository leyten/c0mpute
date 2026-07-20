/**
 * The live network-map feed (P1-#1 completion): a PURE mapping from the swarm control plane's
 * state to the JSON the map page consumes — kept out of Orchestrator so it is testable and so
 * the privacy rule is enforceable in one place.
 *
 * PRIVACY (the data-site rule, scripts/data-stats.ts): aggregates + public-by-design identity
 * only. The PUBLIC shape carries a truncated PeerId as the node handle and NEVER pubkeys,
 * accounts, IPs, multiaddrs or subnets. Dial IPs (needed for server-side geo lookup) appear
 * ONLY in the internal shape, which the HTTP route serves exclusively to loopback — the same
 * box the feed generator runs on.
 */
import type { Candidate, SwarmInfo } from './swarm-types';

export interface NodeCounters {
  tokens: number;              // lifetime settled tokens credited to this node
  receipts: number;            // settled jobs it appeared in (a receipt per job per stage)
}

export interface FeedCounters {
  perNode: Map<string, NodeCounters>;          // nodeId → counters
  tokensToday: number;
  /** (at-ms, tokens) samples from settlement — the throughput window */
  recent: { at: number; tokens: number }[];
}

export interface FeedNode {
  id: string;                  // truncated PeerId (public-by-design) or an opaque handle
  gpu: string;
  vramGb: number | null;
  status: 'serving' | 'standby' | 'joining';
  swarm?: string;
  stageIdx?: number;
  stageN?: number;
  layerLo?: number;
  layerHi?: number;
  upMbps?: number;
  uptimeHrs: number;
  tokensServed: number;
  receipts: number;
  geoHint?: string;            // self-reported region string (display hint only)
  /** INTERNAL shape only — the generator's geo-lookup input; never in the public feed */
  dialIp?: string;
}

export interface NetworkFeed {
  generatedAt: string;
  layerCount: number;
  stats: {
    gpusOnline: number;
    ringsServing: number;
    throughputTokS: number;
    tokensServedToday: number;
    vramPooledGb: number;
  };
  nodes: FeedNode[];
  rings: { swarm: string; status: SwarmInfo['status']; order: string[] }[];
}

const PUB_IP = /\/ip4\/(\d+\.\d+\.\d+\.\d+)\//;
const PRIVATE = /^(10\.|192\.168\.|127\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** First PUBLIC IPv4 in a node's announced multiaddrs (the generator's geo input). */
export function publicIp(addrs?: string[]): string | undefined {
  for (const a of addrs ?? []) {
    const ip = PUB_IP.exec(a)?.[1];
    if (ip && !PRIVATE.test(ip)) return ip;
  }
  return undefined;
}

/** The node's public handle: the PeerId its multiaddrs already advertise, truncated. */
export function nodeHandle(nodeId: string, addrs?: string[]): string {
  for (const a of addrs ?? []) {
    const pid = a.split('/p2p/').pop();
    if (pid && pid.length > 20) return pid.slice(0, 12);
  }
  return `node-${nodeId.slice(0, 8)}`;         // no multiaddrs announced: opaque socket-derived handle
}

function vramGb(cap: Candidate['cap']): number | null {
  const mb = (cap.totalVramMb as number | undefined) ?? (cap.freeVramMb as number | undefined);
  return typeof mb === 'number' && mb > 0 ? Math.round(mb / 1024) : null;
}

export function buildNetworkFeed(
  snapshot: { swarms: SwarmInfo[]; candidates: Candidate[] },
  counters: FeedCounters,
  opts: { layerCount: number; includeDial?: boolean; now?: number } ,
): NetworkFeed {
  const now = opts.now ?? Date.now();
  const capByNode = new Map(snapshot.candidates.map((c) => [c.nodeId, c]));
  const nodes = new Map<string, FeedNode>();

  const mk = (nodeId: string, cand?: Candidate): FeedNode => {
    const cap = cand?.cap ?? ({} as Candidate['cap']);
    const cnt = counters.perNode.get(nodeId) ?? { tokens: 0, receipts: 0 };
    const n: FeedNode = {
      id: nodeHandle(nodeId, cap.addrs as string[] | undefined),
      gpu: (cap.gpu as string | undefined) ?? 'unknown',
      vramGb: cand ? vramGb(cap) : null,
      status: 'standby',
      uptimeHrs: cand ? Math.max(0, (now - cand.announcedAt) / 3_600_000) : 0,
      tokensServed: cnt.tokens,
      receipts: cnt.receipts,
    };
    if (typeof cap.upMbps === 'number') n.upMbps = cap.upMbps;
    if (typeof cap.geo === 'string') n.geoHint = cap.geo;
    if (opts.includeDial) {
      const ip = publicIp(cap.addrs as string[] | undefined);
      if (ip) n.dialIp = ip;
    }
    return n;
  };

  for (const c of snapshot.candidates) nodes.set(c.nodeId, mk(c.nodeId, c));

  const rings: NetworkFeed['rings'] = [];
  let ringsServing = 0;
  for (const sw of snapshot.swarms) {
    if (sw.status === 'failed') continue;
    const serving = sw.status === 'ready' || sw.status === 'serving';
    if (serving) ringsServing++;
    for (const st of sw.stages) {
      const n = nodes.get(st.nodeId) ?? mk(st.nodeId, capByNode.get(st.nodeId));
      nodes.set(st.nodeId, n);
      n.status = serving ? 'serving' : 'joining';
      n.swarm = sw.id;
      n.stageIdx = st.stageIndex;
      n.stageN = sw.stages.length;
      n.layerLo = st.layerStart;
      n.layerHi = st.layerEnd;
    }
    rings.push({
      swarm: sw.id, status: sw.status,
      order: sw.order.map((nid) => nodes.get(nid)?.id ?? `node-${nid.slice(0, 8)}`),
    });
  }

  const winMs = 5 * 60_000;
  const winTok = counters.recent.filter((r) => now - r.at < winMs)
    .reduce((a, r) => a + r.tokens, 0);
  const all = [...nodes.values()];
  return {
    generatedAt: new Date(now).toISOString(),
    layerCount: opts.layerCount,
    stats: {
      gpusOnline: all.length,
      ringsServing,
      throughputTokS: Math.round((winTok / (winMs / 1000)) * 10) / 10,
      tokensServedToday: counters.tokensToday,
      vramPooledGb: all.reduce((a, n) => a + (n.vramGb ?? 0), 0),
    },
    nodes: all,
    rings,
  };
}

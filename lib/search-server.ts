/**
 * Server-side search utilities (Node.js only).
 * Used by the orchestrator to execute Brave web searches.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  age?: string;
}

// Map a friendly recency keyword to Brave's freshness code.
function freshnessCode(freshness?: string): string | null {
  switch (freshness) {
    case 'day': return 'pd';
    case 'week': return 'pw';
    case 'month': return 'pm';
    case 'year': return 'py';
    default: return null;
  }
}

let BRAVE_API_KEY: string | null = null;

export function loadBraveApiKey(): void {
  try {
    const envPath = resolve(homedir(), '.config/env/global.env');
    const envFile = readFileSync(envPath, 'utf8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key === 'BRAVE_API_KEY') {
        BRAVE_API_KEY = value;
        break;
      }
    }
  } catch {
    // Expected if file doesn't exist
  }

  if (BRAVE_API_KEY) {
    console.log('[Search] Brave API key loaded successfully');
  } else {
    console.warn('[Search] No BRAVE_API_KEY found — web search disabled');
  }
}

export async function braveSearch(query: string, freshness?: string): Promise<SearchResult[]> {
  if (!BRAVE_API_KEY) return [];

  try {
    const code = freshnessCode(freshness);
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8${code ? `&freshness=${code}` : ''}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY,
      },
    });

    if (!response.ok) {
      console.error(`[Search] Brave API error: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const results: SearchResult[] = [];

    if (data.web?.results) {
      for (const r of data.web.results.slice(0, 8)) {
        // Use extra_snippets if available for richer context
        let desc = (r.description || '').replace(/<[^>]*>/g, '');
        if (r.extra_snippets && Array.isArray(r.extra_snippets)) {
          const extras = r.extra_snippets.map((s: string) => s.replace(/<[^>]*>/g, '').trim()).filter(Boolean);
          if (extras.length > 0) {
            desc += ' ' + extras.slice(0, 2).join(' ');
          }
        }
        results.push({
          title: (r.title || '').replace(/<[^>]*>/g, ''),
          url: r.url || '',
          description: desc.trim(),
          age: r.age || r.page_age || undefined,
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[Search] Brave search failed:', err);
    return [];
  }
}

/**
 * SSRF guard: reject IPs in private / loopback / link-local / reserved ranges.
 * Covers the cloud-metadata IP (169.254.169.254) and anything on the box's
 * own network so a malicious/redirecting result page can't make the server
 * reach internal services.
 */
function isV4Blocked(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;        // unspecified / 10.0.0.0/8 / loopback
  if (a === 169 && b === 254) return true;                  // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                  // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;        // CGNAT 100.64.0.0/10
  if (a === 198 && (b === 18 || b === 19)) return true;     // 198.18.0.0/15 benchmark
  if (a >= 224) return true;                                // multicast + reserved
  return false;
}
function isIpBlocked(ip: string): boolean {
  const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isV4Blocked(mapped[1]);
  if (net.isIPv4(ip)) return isV4Blocked(ip);
  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true;             // loopback / unspecified
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true; // fc00::/7 unique-local
  if (/^fe[89ab]/.test(v6)) return true;                    // fe80::/10 link-local
  if (v6.startsWith('ff')) return true;                     // multicast
  return false;
}
/** Throws if the URL isn't http(s) or resolves to a blocked address. */
async function assertSafeUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('blocked protocol');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(host)) {
    if (isIpBlocked(host)) throw new Error('blocked ip literal');
    return;
  }
  const addrs = await lookup(host, { all: true });
  if (!addrs.length) throw new Error('no dns records');
  for (const a of addrs) if (isIpBlocked(a.address)) throw new Error('resolves to blocked ip');
}

/**
 * Fetch page content from a URL, extract readable text, truncate to maxChars.
 * SSRF-guarded: every hop (including redirects) is validated against private
 * address ranges before the request is made.
 */
async function fetchPageContent(url: string, maxChars: number = 2500): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    // Follow up to 3 redirects manually, re-validating each hop so an attacker
    // can't use a public URL that 30x-redirects into the internal network.
    let current = url;
    let res: Response | undefined;
    for (let hop = 0; hop < 4; hop++) {
      await assertSafeUrl(current);
      res = await fetch(current, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; c0mpute/1.0)',
          'Accept': 'text/html',
        },
        redirect: 'manual',
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        if (!loc) break;
        current = new URL(loc, current).toString();
        continue;
      }
      break;
    }
    clearTimeout(timeout);
    if (!res || !res.ok) return '';
    const html = await res.text();
    // Strip tags, scripts, styles — crude but fast
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.substring(0, maxChars);
  } catch {
    return '';
  }
}

/**
 * Enrich top search results by fetching actual page content.
 * Fetches top N pages in parallel with timeout.
 */
export async function enrichResults(results: SearchResult[], topN: number = 3, maxChars: number = 1200): Promise<SearchResult[]> {
  const enriched = [...results];
  const fetchPromises = enriched.slice(0, topN).map(async (r, i) => {
    const content = await fetchPageContent(r.url, maxChars);
    if (content.length > 100) {
      enriched[i] = { ...r, description: content };
    }
  });
  await Promise.allSettled(fetchPromises);
  return enriched;
}

export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return '';

  let context = `[Web Search Results]
CRITICAL: Your answer MUST be based ONLY on the text below. Copy all dates, numbers, and names exactly as written.

`;
  results.forEach((r, i) => {
    context += `[${i + 1}] ${r.title}\nURL: ${r.url}\nContent: ${r.description}\n\n`;
  });

  return context;
}

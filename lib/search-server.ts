/**
 * Server-side search utilities (Node.js only).
 * Used by the orchestrator to execute Brave web searches.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

export interface SearchResult {
  title: string;
  url: string;
  description: string;
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

export async function braveSearch(query: string): Promise<SearchResult[]> {
  if (!BRAVE_API_KEY) return [];

  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
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
 * Fetch page content from a URL, extract readable text, truncate to maxChars.
 */
async function fetchPageContent(url: string, maxChars: number = 2500): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; c0mpute/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
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
export async function enrichResults(results: SearchResult[], topN: number = 3): Promise<SearchResult[]> {
  const enriched = [...results];
  const fetchPromises = enriched.slice(0, topN).map(async (r, i) => {
    const content = await fetchPageContent(r.url);
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

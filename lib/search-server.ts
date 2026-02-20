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
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
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
      for (const r of data.web.results.slice(0, 5)) {
        results.push({
          title: (r.title || '').replace(/<[^>]*>/g, ''),
          url: r.url || '',
          description: (r.description || '').replace(/<[^>]*>/g, ''),
        });
      }
    }

    return results;
  } catch (err) {
    console.error('[Search] Brave search failed:', err);
    return [];
  }
}

export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return '';

  let context = '[Web Search Results]\nUse these search results together with the conversation above to give a detailed, direct answer. Do NOT just say "the search results show..." — synthesize the information and answer the question thoroughly:\n\n';
  results.forEach((r, i) => {
    context += `[${i + 1}] ${r.title}\n${r.url}\n${r.description}\n\n`;
  });

  return context;
}

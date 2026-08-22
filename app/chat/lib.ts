// Chat page core: plan catalog, storage, and pure text-processing helpers.
// All behavior here is shared by the page orchestrator and the presentational
// components under app/chat/components/.

import { ChatWithMessages } from '@/lib/types';
import { NetworkStats } from '@/lib/orchestrator/types';

export type SourceRef = { title: string; url: string; description: string };

/** A document a tool generated for this answer. `data` is a full data URL, so
 *  a download link needs nothing else. It is dropped on persistence (store.ts),
 *  and a reloaded turn keeps only the name. */
export type FileRef = { name: string; mime: string; data: string };

export type ChatState = 'idle' | 'queued' | 'streaming' | 'error';

// Plan definitions — the network runs ONE public model (the first entry, the
// default; no tier names anywhere). `workerModel` matches the orchestrator
// MODEL_CATALOG so per-model worker counts line up. `vision`/`thinking` gate
// the composer controls.
// MIGRATION ONLY: the browser-lane entry below stays until the final cutover
// so chat always has a route to live supply while qwen3.8 workers ramp from
// zero — without it, an off-hour with no 27B worker online turns every prompt
// (the whole anonymous funnel included) into "no free capacity". Remove it at
// cutover and the picker collapses to the single model.
// `cost` / `costLabel` are a YARDSTICK, not a price. Text is metered per token
// ($0.15/M in, $0.90/M out — lib/tokenomics.ts), so a message has no fixed
// charge; both models bill from the same rate card and a typical message lands
// at about one credit on either. The label says "about" for that reason, and
// the number exists only so a credit balance can be spoken in messages.
// The browser entry's `modelId` is what job:submit carries, and the
// orchestrator routes it by substring (workerServesModel), not by exact match:
// any browser worker serving a "compute" model takes it. A worker may be on the
// 9B or on the 4B depending on its GPU, which is why the row is named for the
// family rather than a size — the name is shown against every answer it
// produces, and only the family is true of all of them.
export const PLANS = [
  { id: 'qwen38' as const, name: 'Qwen3.8 27B Uncensored', cost: 1, costLabel: '≈ 1 cr / message', modelId: 'qwen3.8-27b-uncensored', tier: 'max' as const, workerModel: 'qwen3.8-27b-uncensored', vision: true, thinking: true, description: 'Tools, vision, thinking — no refusals', features: ['Qwen3.8 27B model', 'Native inference', 'No refusals', 'Web search (tool calling)', 'Vision (image input)', 'Thinking mode'] },
  { id: 'pro' as const, name: 'Qwen3.5', cost: 1, costLabel: '≈ 1 cr / message', modelId: 'Qwen3.5-9B-compute-q4f16_1-MLC', tier: 'pro' as const, workerModel: null, vision: false, thinking: false, description: 'Smaller, browser-powered', features: ['Qwen3.5 9B or 4B, whichever the worker can hold', 'Browser-powered', 'No refusals'] },
] as const;
export type PlanId = typeof PLANS[number]['id'];
export type Plan = typeof PLANS[number];

// The swarm tier: MiniMax M2.5 sharded across worker GPUs. Not servable yet —
// the model picker shows it as a launching entry, disabled while `available`
// is false. There is intentionally no submission path for it.
export const SWARM_PLAN = {
  id: 'swarm' as const,
  name: 'MiniMax M2.5',
  description: '229B, sharded across the network',
  available: false,
} as const;

// Online worker count for a given plan's model: per-model for native (max)
// models so the indicator reflects the actual model, not the whole tier.
export function planWorkerCount(plan: Plan, stats: NetworkStats | null | undefined): number {
  if (plan.tier === 'max') return stats?.nativeByModel?.[plan.workerModel ?? ''] || 0;
  return stats?.browserWorkers || 0;
}

// Local storage keys
export const CHATS_STORAGE_KEY = 'c0mpute_chats';
export const PENDING_PROMPT_KEY = 'c0mpute_pending_prompt';
// Signed anonymous-visitor token (free prompts without login)
export const ANON_TOKEN_KEY = 'c0mpute_anon_token';
export const ANON_FREE_LIMIT = 5;

// Helper to load chats from localStorage
export function loadChatsFromStorage(): ChatWithMessages[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(CHATS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Helper to save chats to localStorage. Generated images are large base64
// PNGs that can blow the ~5MB localStorage quota — on quota failure, retry
// with assistant images stripped (text history beats losing persistence).
export function saveChatsToStorage(chats: ChatWithMessages[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(chats));
  } catch {
    try {
      const slim = chats.map(c => ({
        ...c,
        messages: c.messages.map(m => m.role === 'assistant' && m.images ? { ...m, images: undefined } : m),
      }));
      localStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(slim));
    } catch (err) {
      console.error('Error saving chats to localStorage:', err);
    }
  }
}

// Parse sources from response content (appended by worker as ---SOURCES---)
export function parseSourcesFromContent(content: string): { cleanContent: string; sources: SourceRef[] } {
  const marker = '---SOURCES---';
  const idx = content.indexOf(marker);
  if (idx === -1) return { cleanContent: content, sources: [] };
  const cleanContent = content.substring(0, idx).trimEnd();
  try {
    const sources = JSON.parse(content.substring(idx + marker.length).trim());
    return { cleanContent, sources };
  } catch {
    return { cleanContent: content, sources: [] };
  }
}

// Filter sources to only those cited in the content
export function getUsedSources(content: string, sources: SourceRef[]): { source: SourceRef; originalIndex: number }[] {
  if (sources.length === 0) return [];
  const used: { source: SourceRef; originalIndex: number }[] = [];
  sources.forEach((s, i) => {
    if (content.includes(`[${i + 1}]`)) {
      used.push({ source: s, originalIndex: i });
    }
  });
  // If no inline citations found, show all (fallback for old messages)
  if (used.length === 0) return sources.map((s, i) => ({ source: s, originalIndex: i }));
  return used;
}

// LaTeX is base64-encoded into a tag attribute so markdown-to-jsx passes it
// through untouched — otherwise `_`, `^`, `{}` in formulas get parsed as markdown.
export function encodeTex(tex: string): string {
  try { return btoa(encodeURIComponent(tex)); } catch { return ''; }
}
export function decodeTex(enc: string): string {
  try { return decodeURIComponent(atob(enc)); } catch { return ''; }
}

// Convert $...$ and $$...$$ into custom tags carrying the encoded LaTeX. Code
// spans/fences are skipped so a literal $ inside code stays untouched.
export function mathToTags(text: string): string {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((seg, i) => {
    if (i % 2 === 1) return seg; // code segment
    seg = seg.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex) => `<mathblock data-tex="${encodeTex(tex.trim())}"></mathblock>`);
    seg = seg.replace(/\$(?![\s$])([^\n$]*?)(?<!\s)\$/g, (_m, tex) => `<mathinline data-tex="${encodeTex(tex)}"></mathinline>`);
    return seg;
  }).join('');
}

// Parse <think>...</think> tags from Qwen3 model output. Tool-calling produces
// multiple thinking rounds (think → tool call → think → answer), so collect
// every block into the dropdown and leave only the real answer in the response.
export function parseThinking(content: string): { thinking: string | null; response: string; thinkSeconds: number | null } {
  const timeMatch = content.match(/<!--think_time:(\d+)-->/);
  const thinkSeconds = timeMatch ? parseInt(timeMatch[1], 10) : null;
  let response = content.replace(/<!--think_time:\d+-->/g, '');

  const thoughts: string[] = [];
  response = response.replace(/<think>([\s\S]*?)<\/think>/g, (_m, inner) => {
    thoughts.push(inner.trim());
    return '';
  });

  // An unclosed <think> at the tail means thinking is still streaming
  const open = response.indexOf('<think>');
  if (open !== -1) {
    thoughts.push(response.slice(open + '<think>'.length).trim());
    response = response.slice(0, open);
  }

  const thinking = thoughts.filter(Boolean).join('\n\n').trim();
  return { thinking: thinking || null, response: response.trim(), thinkSeconds };
}

// Filter out common AI disclaimers from responses
export function filterDisclaimers(text: string): string {
  const disclaimerPatterns = [
    /\n\n(?:Please note|Note:|Important:|Keep in mind|Be aware|However,|That said,|I should mention|It'?s important to|Remember that|Disclaimer:)[\s\S]*/i,
    /\n(?:Please note|Note:|Important:|Keep in mind|Be aware|However,|That said,|I should mention|It'?s important to|Remember that|Disclaimer:)[\s\S]*/i,
  ];

  const strip = (s: string) => {
    let out = s;
    for (const pattern of disclaimerPatterns) {
      out = out.replace(pattern, '');
    }
    return out;
  };

  // Never filter inside the reasoning block — a "However,"/"Note:" in the
  // model's thoughts would otherwise truncate the closing </think> and the
  // whole answer with it, leaving only the thinking dropdown. Only strip
  // disclaimers from the answer that follows </think>.
  const close = text.lastIndexOf('</think>');
  if (close !== -1) {
    const head = text.slice(0, close + '</think>'.length);
    const tail = strip(text.slice(close + '</think>'.length));
    return (head + tail).trim();
  }
  // Still mid-thought (open <think>, no close yet) — leave it untouched.
  if (text.indexOf('<think>') !== -1) {
    return text;
  }

  return strip(text).trim();
}

// Format date for the chat list
export function formatChatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString();
}

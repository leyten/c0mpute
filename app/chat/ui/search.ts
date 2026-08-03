// Search across conversations: fuzzy on titles, plain substring on message
// bodies. Bodies are the reason this exists — a conversation you remember by
// something said inside it is otherwise unreachable.
import { parseSourcesFromContent, parseThinking } from '../lib';
import type { Convo } from './store';

export interface Snippet { before: string; match: string; after: string }
export interface Hit { convo: Convo; score: number; snippet: Snippet | null }

/** Subsequence match with bonuses for runs and word starts. -1 when no match. */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;
  const t = text.toLowerCase();

  const direct = t.indexOf(q);
  if (direct !== -1) return 1000 - Math.min(direct, 60) * 2 + (direct === 0 ? 60 : 0);

  let at = 0;
  let score = 0;
  let run = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const found = t.indexOf(ch, at);
    if (found === -1) return -1;
    run = found === at ? run + 1 : 0;
    const wordStart = found === 0 || /[\s\-_/:.,()]/.test(t[found - 1]);
    score += 12 + run * 6 + (wordStart ? 10 : 0) - Math.min(found - at, 12);
    at = found + 1;
  }
  return score;
}

/** Message content as the reader saw it: no think blocks, no sources tail. */
function plainText(content: string): string {
  const { cleanContent } = parseSourcesFromContent(content);
  const { response } = parseThinking(cleanContent);
  return (response || cleanContent).replace(/\s+/g, ' ').trim();
}

const BEFORE = 34;
const AFTER = 80;

/** First body hit in a conversation, cut to a readable window. */
function bodySnippet(query: string, convo: Convo): Snippet | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  const word = q.split(/\s+/).filter(w => w.length >= 3).sort((a, b) => b.length - a.length)[0];

  for (const m of convo.messages) {
    const text = plainText(m.content);
    if (!text) continue;
    const lower = text.toLowerCase();

    let at = lower.indexOf(q);
    let len = q.length;
    if (at === -1) {
      if (!word) continue;
      at = lower.indexOf(word);
      len = word.length;
      if (at === -1) continue;
    }

    const start = Math.max(0, at - BEFORE);
    const end = Math.min(text.length, at + len + AFTER);
    return {
      before: (start > 0 ? '…' : '') + text.slice(start, at),
      match: text.slice(at, at + len),
      after: text.slice(at + len, end) + (end < text.length ? '…' : ''),
    };
  }
  return null;
}

/** A title only wins outright when the query actually reads in it: fuzzyScore
 *  clears 880 for a substring, while a loose subsequence lands in the tens.
 *  Without this floor almost any title matches by accident, the body is never
 *  searched, and the one thing this feature exists for stops working. */
const TITLE_STRONG = 400;

/** Strong title matches first, then bodies, then the loose title matches that
 *  are worth offering at all. Recency breaks ties. */
export function searchConvos(query: string, convos: Convo[]): Hit[] {
  const q = query.trim();
  if (!q) return convos.map(c => ({ convo: c, score: 0, snippet: null }));

  const hits: Hit[] = [];
  for (const c of convos) {
    const title = fuzzyScore(q, c.title);
    if (title >= TITLE_STRONG) { hits.push({ convo: c, score: 2000 + title, snippet: null }); continue; }
    const snippet = bodySnippet(q, c);
    if (snippet) { hits.push({ convo: c, score: 1000 + Math.max(title, 0), snippet }); continue; }
    if (title >= 0) hits.push({ convo: c, score: title, snippet: null });
  }
  return hits.sort((a, b) => b.score - a.score || b.convo.updatedAt - a.convo.updatedAt);
}

/** Mac renders ⌘K, everything else ctrl+K. Call after mount only. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

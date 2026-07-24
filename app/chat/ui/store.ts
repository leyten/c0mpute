// Local persistence. A conversation is created on first send, never on
// "new chat", so the list never fills with empty drafts.
export type Role = 'user' | 'assistant';

export interface Msg {
  id: string;
  role: Role;
  /** Raw content: may carry <think> blocks and a ---SOURCES--- tail, exactly
   *  as the shared parsers expect. */
  content: string;
  images?: string[];
}

export interface Convo {
  id: string;
  title: string;
  updatedAt: number;
  model: string;
  messages: Msg[];
}

const KEY = 'c0mpute_chat_v2';
const VERSION = 1;

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New conversation';
  return clean.length > 48 ? clean.slice(0, 48).trimEnd() + '…' : clean;
}

export function load(): Convo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list: Convo[] = Array.isArray(parsed) ? parsed : parsed?.convos ?? [];
    return list.filter(c => c && Array.isArray(c.messages)).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function save(convos: Convo[]): void {
  if (typeof window === 'undefined') return;
  const write = (list: Convo[]) =>
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, convos: list }));
  try {
    write(convos);
  } catch {
    // Quota: drop generated images before ever losing text.
    try {
      write(convos.map(c => ({
        ...c,
        messages: c.messages.map(m => (m.role === 'assistant' ? { ...m, images: undefined } : m)),
      })));
    } catch {
      try {
        write(convos.slice(0, 20));
      } catch { /* give up quietly; the session still works in memory */ }
    }
  }
}

/** Day buckets for the sidebar. Sentence case, never shouty labels. */
export function groupByDay(convos: Convo[]): { label: string; items: Convo[] }[] {
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = startOf(now);
  const yesterday = today - 86400000;
  const week = today - 6 * 86400000;

  const buckets: { label: string; items: Convo[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const c of convos) {
    const t = c.updatedAt;
    if (t >= today) buckets[0].items.push(c);
    else if (t >= yesterday) buckets[1].items.push(c);
    else if (t >= week) buckets[2].items.push(c);
    else buckets[3].items.push(c);
  }
  return buckets.filter(b => b.items.length > 0);
}

/** dataURI -> bare base64, the shape workers receive. */
export const toWire = (dataUri: string) => dataUri.replace(/^data:[^;]+;base64,/, '');

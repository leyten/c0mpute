// Local persistence. A conversation is created on first send, never on
// "new chat", so the list never fills with empty drafts.
//
// An assistant turn keeps every answer it has been given: `versions` holds
// them oldest first, `active` is the one on screen, and `content`/`images`
// mirror that active version so every reader downstream — the context
// builder, copy, the renderers — keeps reading a single field.
import type { FileRef } from '../lib';

export type Role = 'user' | 'assistant';

/** Which model produced an answer, captured when the answer lands. */
export interface VersionModel {
  id: string;
  name: string;
  costLabel: string;
}

export interface Version {
  id: string;
  /** Raw content: may carry <think> blocks and a ---SOURCES--- tail, exactly
   *  as the shared parsers expect. */
  content: string;
  images?: string[];
  /** Documents this answer generated, offered as downloads. Only the ones from
   *  the session that made them can still be downloaded: `data` does not
   *  survive persistence (see save). */
  files?: FileRef[];
  model?: VersionModel;
  /** Cut short by the stop button, so the turn can offer to continue it. */
  truncated?: boolean;
  /** An image was announced for this answer and has not arrived yet. The
   *  placeholder stays on the committed turn so it never blinks out and back. */
  pendingImage?: boolean;
  createdAt: number;
}

export interface Msg {
  id: string;
  role: Role;
  /** The visible answer. For assistants this mirrors versions[active]. */
  content: string;
  images?: string[];
  truncated?: boolean;
  /** Assistant only: every answer this turn has had, oldest first. */
  versions?: Version[];
  /** Index into `versions` of the answer on screen and in the context. */
  active?: number;
}

export interface Convo {
  id: string;
  title: string;
  updatedAt: number;
  model: string;
  /** Standing instructions for this conversation. Sent in front of every
   *  request as a user-role preamble, never as a system message: see
   *  buildPayload in index.tsx. Absent on conversations that never set any. */
  instructions?: string;
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

// ---- versions ----

/** The id is chosen by the caller: a job knows which version it is writing
 *  before it has any text, and late images need that id to find it again. */
export function makeVersion(id: string, content: string, model?: VersionModel, truncated?: boolean, pendingImage?: boolean): Version {
  return { id, content, model, truncated: truncated || undefined, pendingImage: pendingImage || undefined, createdAt: Date.now() };
}

export function assistantMsg(id: string, version: Version): Msg {
  return {
    id,
    role: 'assistant',
    content: version.content,
    images: version.images,
    truncated: version.truncated,
    versions: [version],
    active: 0,
  };
}

/** Tolerant read: a message stored without versions still answers with one. */
export function versionsOf(msg: Msg): Version[] {
  if (msg.versions && msg.versions.length > 0) return msg.versions;
  return [{ id: msg.id, content: msg.content, images: msg.images, truncated: msg.truncated, createdAt: 0 }];
}

export function activeIndex(msg: Msg): number {
  const n = versionsOf(msg).length;
  const i = msg.active ?? n - 1;
  return i >= 0 && i < n ? i : n - 1;
}

/** The answer on screen, and the one later turns are built on. */
export function activeVersion(msg: Msg): Version {
  return versionsOf(msg)[activeIndex(msg)];
}

/** The one place that keeps content/images in step with the active version. */
function mirror(msg: Msg, versions: Version[], active: number): Msg {
  const v = versions[active];
  return { ...msg, versions, active, content: v.content, images: v.images, truncated: v.truncated };
}

/** Append an answer and show it. The older ones stay. */
export function addVersion(msg: Msg, v: Version): Msg {
  const versions = [...versionsOf(msg), v];
  return mirror(msg, versions, versions.length - 1);
}

export function selectVersion(msg: Msg, index: number): Msg {
  const versions = versionsOf(msg);
  if (index < 0 || index >= versions.length) return msg;
  return mirror(msg, versions, index);
}

/** Generated images arrive after the text, sometimes long after it. They
 *  belong to the version that was being written, not to whichever one happens
 *  to be on screen when they land, so they are addressed by version id. */
export function addImagesTo(msg: Msg, versionId: string, images: string[]): Msg {
  const versions = versionsOf(msg);
  const at = versions.findIndex(v => v.id === versionId);
  if (at === -1) return msg;
  const next = versions.map((v, i) => (i === at ? { ...v, images: [...(v.images ?? []), ...images], pendingImage: undefined } : v));
  return mirror(msg, next, activeIndex(msg));
}

/** The thread truncated at a message: everything before `id`, nothing after.
 *  Editing a message replaces it and the branch below it, so it rebuilds from
 *  here. This reads position only, never any other field on Msg, so it stays
 *  correct as the message model grows. An id that is no longer in the thread
 *  leaves it untouched. */
export function truncateAt(msgs: Msg[], id: string | undefined): Msg[] {
  if (!id) return msgs;
  const i = msgs.findIndex(m => m.id === id);
  return i === -1 ? msgs : msgs.slice(0, i);
}

// ---- storage ----

/** Conversations written by the interface this one replaces, under
 *  `c0mpute_chats`: `ChatWithMessages[]` from lib/types.ts, with snake_case
 *  timestamps and a system role this schema does not carry. Read once, on the
 *  first load that finds no v2 data, then written forward under the new key so
 *  it never runs again. The old key is left in place, so rolling back to the
 *  previous build still finds its history. */
const LEGACY_KEY = 'c0mpute_chats';

interface LegacyMessage { id?: string; role?: string; content?: string; images?: string[]; created_at?: string }
interface LegacyChat { id?: string; title?: string; updated_at?: string; created_at?: string; messages?: LegacyMessage[] }

function adoptLegacy(): Convo[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let chats: LegacyChat[];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    chats = parsed as LegacyChat[];
  } catch {
    return [];
  }

  const convos: Convo[] = [];
  for (const c of chats) {
    if (!c || !Array.isArray(c.messages)) continue;

    const messages: Msg[] = [];
    for (const m of c.messages) {
      // the old store kept system turns; this schema has no place for them
      if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
      const content = typeof m.content === 'string' ? m.content : '';
      const id = typeof m.id === 'string' && m.id ? m.id : uid();
      const images = Array.isArray(m.images) && m.images.length ? m.images : undefined;
      if (m.role === 'user') {
        messages.push({ id, role: 'user', content, images });
      } else {
        // one version, so regenerating an adopted answer behaves exactly as it
        // does on one written by this build
        const at = Date.parse(m.created_at ?? '') || Date.now();
        messages.push({
          id,
          role: 'assistant',
          content,
          images,
          versions: [{ id: uid(), content, images, createdAt: at }],
          active: 0,
        });
      }
    }
    if (messages.length === 0) continue;

    const stamp = Date.parse(c.updated_at ?? c.created_at ?? '');
    convos.push({
      id: typeof c.id === 'string' && c.id ? c.id : uid(),
      title: typeof c.title === 'string' && c.title.trim() ? c.title : titleFrom(messages[0].content),
      updatedAt: Number.isFinite(stamp) ? stamp : Date.now(),
      model: 'pro',
      messages,
    });
  }

  if (convos.length > 0) save(convos);
  return convos.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function load(): Convo[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return adoptLegacy();
    const parsed = JSON.parse(raw);
    const list: Convo[] = Array.isArray(parsed) ? parsed : parsed?.convos ?? [];
    return list
      .filter(c => c && Array.isArray(c.messages))
      .map(c => ({ ...c, instructions: typeof c.instructions === 'string' && c.instructions.trim() ? c.instructions : undefined }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function save(convos: Convo[]): void {
  if (typeof window === 'undefined') return;
  const write = (list: Convo[]) =>
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, convos: list }));
  // Generated documents are base64 data URLs — never worth a quota slot. The
  // name is kept so a reloaded turn still shows what it produced; the download
  // itself belongs to the session that made it.
  const list = convos.map(c => ({
    ...c,
    messages: c.messages.map(m => (m.versions
      ? { ...m, versions: m.versions.map(v => (v.files ? { ...v, files: v.files.map(f => ({ ...f, data: '' })) } : v)) }
      : m)),
  }));
  try {
    write(list);
  } catch {
    // Quota: drop generated images, in every version, before losing text.
    try {
      write(list.map(c => ({
        ...c,
        messages: c.messages.map(m => (m.role === 'assistant'
          ? { ...m, images: undefined, versions: m.versions?.map(v => ({ ...v, images: undefined })) }
          : m)),
      })));
    } catch {
      try {
        write(list.slice(0, 20));
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

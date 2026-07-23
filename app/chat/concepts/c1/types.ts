// Concept 1 — "The Instrument". Local types owned entirely by this concept:
// the persisted thread schema (localStorage key c0mpute_c1_threads) and the
// in-flight turn state the streaming pipeline writes into.

import type { PlanId, SourceRef } from '../../lib';

/** Mirrors the orchestrator submit cap (lib/orchestrator/types MAX_INPUT_CHARS). */
export const MAX_INPUT_CHARS = 2000;

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  /** Assistant content keeps raw <think> tags; parsed at render time. */
  content: string;
  /** User: attached input images (data URIs). Assistant: generated images. */
  images?: string[];
  /** Assistant only: web-search sources reported for this reply. */
  sources?: SourceRef[];
  /** Assistant only: seconds spent inside <think>, as measured by the engine. */
  thinkSeconds?: number;
  /** Assistant only: the user stopped generation before the reply finished. */
  stopped?: boolean;
  createdAt: string;
};

export type Thread = {
  id: string;
  title: string;
  /** Each conversation remembers its own model and thinking setting. */
  model: PlanId;
  think: boolean;
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
};

export type StoreShape = {
  v: 1;
  activeId: string | null;
  defaultModel: PlanId;
  threads: Thread[];
};

/** The one in-flight response. Exists only while a job is running. */
export type Turn = {
  threadId: string;
  /** First token has arrived. */
  started: boolean;
  queuePos: number | null;
  searching: boolean;
  imaging: boolean;
  /** Throttle-flushed view of the stream buffer (raw, may contain <think>). */
  text: string;
  sources: SourceRef[];
  /** Generated images that landed before completion. */
  images: string[];
};

export type TurnError = {
  /** '' when the failure happened before any thread existed. */
  threadId: string;
  message: string;
  signIn?: boolean;
  topUp?: boolean;
};

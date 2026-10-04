/**
 * Long context (paid native budget) + context-aware native dispatch.
 *
 * Pure-function test, no sockets: exercises the input bound at both native
 * budgets, the paid/free budget decision, and the worker pick for long and short
 * jobs against a mixed-window fleet (8K / 16K / 32K / unknown).
 *
 * Run:  npx tsx scripts/long-context-test.ts
 */
import {
  boundInputMessages,
  inputTokenBudget,
  longContextEligible,
  nativeCtxNeed,
  pickWorkerForJob,
  pickNextDispatch,
  longContextNeed,
  longContextServable,
  LONG_JOB_HOLD_MS,
} from '../lib/orchestrator/orchestrator';
import {
  MAX_INPUT_TOKENS_NATIVE,
  MAX_INPUT_TOKENS_NATIVE_PAID,
  MAX_INPUT_TOKENS_BROWSER,
  NATIVE_PROMPT_OVERHEAD_TOKENS,
  MAX_OUTPUT_TOKENS,
  MAX_OUTPUT_TOKENS_THINKING,
  type ChatMessage,
  type Job,
} from '../lib/orchestrator/types';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }

const MAX = 'qwen3.8-27b-uncensored';   // native (max tier)
const PRO = 'some-browser-model';       // browser lane (not in the catalog -> pro)
const SWARM = 'minimax-m2.5';           // sharded swarm lane

/** A message of exactly `tokens` estimated tokens (chars/4). */
const msg = (role: ChatMessage['role'], tokens: number): ChatMessage => ({ role, content: 'x'.repeat(tokens * 4) });
const est = (ms: ChatMessage[] | undefined) => Math.ceil((ms ?? []).reduce((n, m) => n + (m.content?.length ?? 0), 0) / 4);

// ── 1. Budgets ──
console.log('\n# budgets');
check(MAX_INPUT_TOKENS_NATIVE === 12_000, 'free native budget is still 12,000 (credits route projects the free reservation on it)');
check(inputTokenBudget(MAX) === 12_000 && inputTokenBudget(MAX, false) === 12_000, 'max lane, not long-context -> 12,000');
check(inputTokenBudget(MAX, true) === MAX_INPUT_TOKENS_NATIVE_PAID && MAX_INPUT_TOKENS_NATIVE_PAID === 16_000, 'max lane, long-context -> 16,000');
check(inputTokenBudget(PRO, true) === MAX_INPUT_TOKENS_BROWSER && inputTokenBudget(PRO) === MAX_INPUT_TOKENS_BROWSER, 'browser lane unchanged either way (1,800)');
check(inputTokenBudget(SWARM, true) === 12_000 && inputTokenBudget(SWARM) === 12_000, 'swarm lane unchanged either way (12,000)');
// Measured real/estimate ratios (Qwen3.5 tokenizer): JSON up to 1.76x, Chinese 1.94x.
// Injected system prompt + tools measured ~1,100 real tokens.
const json = Math.round(MAX_INPUT_TOKENS_NATIVE_PAID * 1.76), zh = Math.round(MAX_INPUT_TOKENS_NATIVE_PAID * 1.94);
check(json + NATIVE_PROMPT_OVERHEAD_TOKENS <= 32_768, `worst JSON prompt fits 32K even at the 2,048 reserve (${json} + ${NATIVE_PROMPT_OVERHEAD_TOKENS} = ${json + NATIVE_PROMPT_OVERHEAD_TOKENS})`);
check(zh + 1_100 <= 32_768, `Chinese prompt fits 32K at the measured overhead (${zh} + 1100 = ${zh + 1_100})`);
check(MAX_INPUT_TOKENS_NATIVE_PAID + NATIVE_PROMPT_OVERHEAD_TOKENS + MAX_OUTPUT_TOKENS_THINKING <= 32_768,
  `a prompt near its estimate keeps the full thinking answer (${MAX_INPUT_TOKENS_NATIVE_PAID + NATIVE_PROMPT_OVERHEAD_TOKENS + MAX_OUTPUT_TOKENS_THINKING})`);

// ── 2. boundInputMessages at both budgets ──
console.log('\n# boundInputMessages');
// system + 7 turns of 2,000 tokens = 14,100 estimated: over 12K, under 16K.
const convo: ChatMessage[] = [{ role: 'system', content: 'x'.repeat(400) }];
for (let i = 0; i < 7; i++) convo.push(msg(i % 2 === 0 ? 'user' : 'assistant', 2_000));
check(est(convo) === 14_100, `fixture conversation is ~14,100 tokens (${est(convo)})`);
const free = boundInputMessages(convo, MAX_INPUT_TOKENS_NATIVE);
check(free.ok && free.dropped === 2 && est(free.messages) <= 12_000, `12K budget trims oldest history (dropped ${free.ok ? free.dropped : '-'}, kept ~${free.ok ? est(free.messages) : '-'})`);
check(free.ok && free.messages![0].role === 'system' && free.messages![free.messages!.length - 1] === convo[convo.length - 1], '12K trim keeps system + newest message');
const paid = boundInputMessages(convo, MAX_INPUT_TOKENS_NATIVE_PAID);
check(paid.ok && paid.dropped === 0 && paid.messages === convo, '16K budget ships the whole conversation untouched');
const big = [msg('user', 15_000)];
const bigFree = boundInputMessages(big, MAX_INPUT_TOKENS_NATIVE);
const bigPaid = boundInputMessages(big, MAX_INPUT_TOKENS_NATIVE_PAID);
check(!bigFree.ok && bigFree.estTokens === 15_000, 'single 15K message rejected at the 12K budget');
check(bigPaid.ok && bigPaid.dropped === 0, 'single 15K message accepted at the 16K budget');
check(!boundInputMessages([msg('user', 16_001)], MAX_INPUT_TOKENS_NATIVE_PAID).ok, 'single 16,001-token message rejected even at the 16K budget');
// Rejection text is built from the budget that applied: floor(budget*4/1000)k chars.
check(Math.floor((MAX_INPUT_TOKENS_NATIVE * 4) / 1000) === 48 && Math.floor((MAX_INPUT_TOKENS_NATIVE_PAID * 4) / 1000) === 64,
  'too-long text quotes ~48k chars (free) / ~64k chars (long context)');

// ── 3. Paid / free decision ──
console.log('\n# longContextEligible');
// API jobs follow the chat rule: the decision has no internal/API input at all.
const lc = (anon: boolean, plan: 'free' | 'pro' | 'max' | undefined, paysCredits: boolean) =>
  longContextEligible({ anon, plan, paysCredits });
const cases: [string, boolean, 'free' | 'pro' | 'max' | undefined, boolean, number][] = [
  ['anonymous visitor', true, undefined, false, 12_000],
  ['anonymous visitor claiming credits (impossible lane)', true, undefined, true, 12_000],
  ['chat, Free plan, free grant / welcome prompt', false, 'free', false, 12_000],
  ['chat, Free plan, staking allowance', false, 'free', false, 12_000],
  ['chat, Free plan, paying credits', false, 'free', true, 16_000],
  ['chat, Pro plan', false, 'pro', false, 16_000],
  ['chat, Max plan', false, 'max', false, 16_000],
  ['API, Free-plan key on the staking allowance (resale key)', false, 'free', false, 12_000],
  ['API, Free-plan key paying credits', false, 'free', true, 16_000],
  ['API, Pro-plan key (from the start)', false, 'pro', false, 16_000],
  ['API, Max-plan key (from the start)', false, 'max', false, 16_000],
];
for (const [label, anon, plan, pays, want] of cases) {
  const b = inputTokenBudget(MAX, lc(anon, plan, pays));
  check(b === want, `${label} -> ${b}`);
}

// ── 3b. Servability gate ──
// The paid budget only applies while some online worker (busy included) that can
// serve the job has a known window holding a full long-context job. Prod fleet at
// the time of the incident: 7 x 16384 + 1 x 8192, the only 32K worker offline.
console.log('\n# servability gate');
type GW = { id: string; status: 'idle' | 'busy'; numCtx?: number; model: string };
const prodFleet: GW[] = [
  ...Array.from({ length: 7 }, (_, k): GW => ({ id: `s${k}`, status: k % 2 ? 'busy' : 'idle', numCtx: 16_384, model: MAX })),
  { id: 'e8', status: 'idle', numCtx: 8_192, model: MAX },
];
const serves = (w: GW) => w.model === MAX;
const fits = (ws: GW[], think: boolean) => longContextServable(ws, serves, MAX, think);
/** The budget the submit handler bounds at: eligible AND servable. */
const gatedBudget = (ws: GW[], plan: 'free' | 'pro', paysCredits: boolean, think: boolean) =>
  inputTokenBudget(MAX, lc(false, plan, paysCredits) && fits(ws, think));
check(longContextNeed(MAX, false) === 16_000 + 2_048 + 4_096 && longContextNeed(MAX, true) === 16_000 + 2_048 + 8_192,
  `need: ${longContextNeed(MAX, false)} without thinking, ${longContextNeed(MAX, true)} with`);
check(!fits(prodFleet, false) && !fits(prodFleet, true), 'prod fleet (7x16K + 1x8K, 32K offline) holds no long-context job');
check(gatedBudget(prodFleet, 'pro', false, false) === 12_000 && gatedBudget(prodFleet, 'pro', false, true) === 12_000, 'Pro user, no fitting worker online -> 12K');
const with32 = (status: 'idle' | 'busy') => [...prodFleet, { id: 'b32', status, numCtx: 32_768, model: MAX }];
check(gatedBudget(with32('idle'), 'pro', false, false) === 16_000 && gatedBudget(with32('idle'), 'pro', false, true) === 16_000, 'Pro user, idle 32K worker online -> 16K');
check(gatedBudget(with32('busy'), 'pro', false, false) === 16_000 && gatedBudget(with32('busy'), 'pro', false, true) === 16_000, 'Pro user, busy 32K worker online -> 16K');
const with24 = [...prodFleet, { id: 'm24', status: 'idle' as const, numCtx: 24_576, model: MAX }];
check(gatedBudget(with24, 'pro', false, false) === 16_000, `24K worker holds a non-thinking job (${longContextNeed(MAX, false)}) -> 16K`);
check(gatedBudget(with24, 'pro', false, true) === 12_000, `24K worker cannot hold a thinking job (${longContextNeed(MAX, true)}) -> 12K`);
check(gatedBudget([...prodFleet, { id: 'u', status: 'idle', numCtx: undefined, model: MAX }], 'pro', false, false) === 12_000, 'unknown-window worker does not open the gate');
check(gatedBudget([...prodFleet, { id: 'x32', status: 'idle', numCtx: 32_768, model: 'other-model' }], 'pro', false, false) === 12_000,
  '32K worker that cannot serve the model does not open the gate');
check(gatedBudget(prodFleet, 'free', true, false) === 12_000, 'Free-plan credit payer, no fitting worker -> no re-bound, 12K');
check(gatedBudget(with32('busy'), 'free', true, false) === 16_000, 'Free-plan credit payer, fitting worker online -> re-bound to 16K');
check(gatedBudget(with32('idle'), 'free', false, false) === 12_000, 'Free-plan grant user stays 12K even with a 32K worker online');

// ── 4. Dispatch ──
console.log('\n# dispatch');
type W = { id: string; status: 'idle' | 'busy'; numCtx?: number; tps: number };
const fleet = (over: Partial<Record<string, Partial<W> | null>> = {}): W[] => {
  const base: W[] = [
    { id: 'w8', status: 'idle', numCtx: 8_192, tps: 40 },
    { id: 'w16a', status: 'idle', numCtx: 16_384, tps: 40 },
    { id: 'w16b', status: 'idle', numCtx: 16_384, tps: 40 },
    { id: 'w32', status: 'idle', numCtx: 32_768, tps: 40 },
    { id: 'wUnk', status: 'idle', numCtx: undefined, tps: 40 },
  ];
  return base.flatMap((w) => (over[w.id] === null ? [] : [{ ...w, ...(over[w.id] ?? {}) }]));
};
const all = () => true;
const weight = (w: W) => w.tps;
/** Every distinct outcome over a sweep of the random draw. */
const outcomes = (ws: W[], ctx: ReturnType<typeof nativeCtxNeed>) => {
  const seen = new Set<string>();
  for (let k = 0; k < 200; k++) {
    const r = pickWorkerForJob(ws, all, weight, ctx, () => k / 200);
    seen.add(r === null ? 'null' : r === 'hold' ? 'hold' : r.id);
  }
  return [...seen].sort().join(',');
};
const t0 = 1_700_000_000_000;
const job = (inputTokens: number, think = false, model = MAX) => ({ requestedModel: model, messages: [msg('user', inputTokens)], think, createdAt: new Date(t0) });

const longJob = job(15_000);
const longNeed = nativeCtxNeed(longJob, t0 + 1_000)!;
check(longNeed.required === 15_000 + NATIVE_PROMPT_OVERHEAD_TOKENS + MAX_OUTPUT_TOKENS && longNeed.mayHold, `long job needs ${longNeed.required} ctx and may hold`);
check(nativeCtxNeed(job(15_000, true), t0)!.required === 15_000 + NATIVE_PROMPT_OVERHEAD_TOKENS + MAX_OUTPUT_TOKENS_THINKING, 'thinking job reserves the thinking output cap');
check(outcomes(fleet(), longNeed) === 'w32', 'long job + idle 32K worker -> always the 32K worker');
check(outcomes(fleet({ w32: { status: 'busy' } }), longNeed) === 'hold', 'long job + 32K worker busy -> stays queued (hold)');
check(outcomes(fleet({ w32: null }), longNeed) === 'w16a,w16b,w8,wUnk', 'long job + no 32K online -> falls back to any idle worker (unknown included)');
check(outcomes(fleet({ w32: { status: 'busy' } }), nativeCtxNeed(longJob, t0 + LONG_JOB_HOLD_MS)!) === 'w16a,w16b,w8,wUnk',
  `long job held ${LONG_JOB_HOLD_MS / 1000}s -> hold expires, falls back to any idle worker`);
check(outcomes(fleet({ w8: { status: 'busy' }, w16a: { status: 'busy' }, w16b: { status: 'busy' }, wUnk: { status: 'busy' }, w32: { status: 'busy' } }), longNeed) === 'hold',
  'long job + whole fleet busy -> hold (stays queued, as before)');
check(outcomes(fleet({ w32: { numCtx: undefined } }), longNeed) === 'w16a,w16b,w32,w8,wUnk', 'unknown-window worker is not preferred for a long job, only part of the fallback');
check(outcomes(fleet({ w32: null, wUnk: { status: 'busy' } }), longNeed) === 'w16a,w16b,w8', 'a busy unknown-window worker never causes a hold');

// Short jobs (input <= 12K) have NO window rule: today's candidate set, unchanged.
// `outcomes` sweeps the random draw across [0,1), so it returns the full set of
// workers the pick can reach — the candidate set, not one random pick.
check(nativeCtxNeed(job(2_000), t0) === null, 'short job -> no window rule');
check(nativeCtxNeed(job(2_000, true), t0) === null, 'short thinking job -> no window rule');
check(nativeCtxNeed(job(MAX_INPUT_TOKENS_NATIVE), t0) === null, 'job at exactly the 12K budget is short -> no window rule');
check(nativeCtxNeed(job(MAX_INPUT_TOKENS_NATIVE + 1), t0) !== null, 'job at 12K + 1 is long -> window rule');
const shortThink = nativeCtxNeed(job(2_000, true), t0);   // would need 12,240 ctx under a fit rule
const w8w32 = fleet({ w16a: null, w16b: null, wUnk: null });
check(outcomes(w8w32, shortThink) === 'w32,w8', `short thinking job + idle 8K and 32K workers -> candidate set keeps both (${outcomes(w8w32, shortThink)})`);
check(outcomes(fleet(), nativeCtxNeed(job(10_000), t0)) === 'w16a,w16b,w32,w8,wUnk', 'short job -> every idle worker is a candidate (8K and unknown included)');
check(outcomes(fleet({ w8: { status: 'busy' }, w16a: { status: 'busy' }, w16b: { status: 'busy' }, wUnk: { status: 'busy' }, w32: { status: 'busy' } }), nativeCtxNeed(job(2_000), t0)) === 'null',
  'short job + whole fleet busy -> no pick (stays queued, as before)');
// Same draw as before for a short job: identical pick to the no-rule path for every rand.
let shortSame = true;
const pickId = (r: W | 'hold' | null) => (r === null || r === 'hold' ? r : r.id);
for (let k = 0; k < 1_000; k++) {
  const r0 = k / 1_000;
  const ws = fleet();
  if (pickId(pickWorkerForJob(ws, all, weight, nativeCtxNeed(job(11_000, true), t0), () => r0)) !== pickId(pickWorkerForJob(ws, all, weight, null, () => r0))) { shortSame = false; break; }
}
check(shortSame, 'short job pick identical to the no-rule pick for every random draw');
check(nativeCtxNeed(job(15_000, false, PRO), t0) === null, 'browser-lane job has no window rule');
check(outcomes(fleet(), null) === 'w16a,w16b,w32,w8,wUnk', 'no window rule -> every idle worker, as before');
const gated = pickWorkerForJob(fleet({ w32: { status: 'busy' } }), (w) => w.id !== 'w32', weight, longNeed);
check(gated !== 'hold' && gated !== null, 'a busy 32K worker that cannot serve the job (model/age gate) never causes a hold');

// The weighted draw is the one dispatch always made: same order, same weights,
// same subtract-until-<=0 walk. Compare against the old inline loop verbatim.
const oldPick = (ws: W[], r0: number) => {
  const eligible: { worker: W; weight: number }[] = [];
  let totalWeight = 0;
  for (const worker of ws) { if (worker.status !== 'idle') continue; eligible.push({ worker, weight: worker.tps }); totalWeight += worker.tps; }
  if (!eligible.length) return null;
  let r = r0 * totalWeight;
  let chosen = eligible[eligible.length - 1];
  for (const e of eligible) { if ((r -= e.weight) <= 0) { chosen = e; break; } }
  return chosen.worker;
};
let same = true;
for (let trial = 0; trial < 2_000; trial++) {
  const ws: W[] = Array.from({ length: 1 + (trial % 7) }, (_, k) => ({
    id: `t${k}`, status: Math.random() < 0.3 ? 'busy' : 'idle', numCtx: 16_384, tps: 5 + Math.floor(Math.random() * 80),
  }));
  const r0 = Math.random();
  if (pickWorkerForJob(ws, all, weight, null, () => r0) !== oldPick(ws, r0)) { same = false; break; }
}
check(same, 'weighted-random pick identical to the old inline loop (2,000 random fleets)');

// ── 5. Queue timeline: a held long job and the short jobs that arrive after it ──
// Replays processQueue's scan (pickNextDispatch) one call at a time on a fake
// clock: each step dispatches at most one job, exactly like processQueue.
console.log('\n# queue timeline');
check(LONG_JOB_HOLD_MS === 30_000, 'long-job hold is 30s');
type QJ = Pick<Job, 'status' | 'requestedModel' | 'messages' | 'think' | 'createdAt'> & { id: string };
const qjob = (id: string, inputTokens: number, atMs: number): QJ =>
  ({ id, status: 'pending', requestedModel: MAX, messages: [msg('user', inputTokens)], think: false, createdAt: new Date(atMs) });
const w16: W = { id: 'w16', status: 'idle', numCtx: 16_384, tps: 40 };
const w32: W = { id: 'w32', status: 'busy', numCtx: 32_768, tps: 40 };
const queue: QJ[] = [];
const log: { job: string; worker: string; atS: number }[] = [];
let pickedNonPending = false;
const step = (atMs: number) => {
  const s = pickNextDispatch(queue, [w16, w32], () => true, weight, atMs);
  if (s.pick) {
    if (s.pick.job.status !== 'pending') pickedNonPending = true;
    s.pick.job.status = 'processing';
    s.pick.worker.status = 'busy';
    log.push({ job: s.pick.job.id, worker: s.pick.worker.id, atS: (atMs - t0) / 1000 });
    queue.splice(s.pick.index, 1);
  }
  return { picked: s.pick ? `${s.pick.job.id}->${s.pick.worker.id}` : 'none', held: s.held.map((h) => h.job.id).join(',') };
};
const L = qjob('L', 15_000, t0);
queue.push(L);
let st = step(t0);
check(st.picked === 'none' && st.held === 'L', `t=0  long job L, 32K busy, 16K idle -> L held (${st.picked}, held=${st.held})`);
queue.push(qjob('S1', 2_000, t0 + 5_000));
st = step(t0 + 5_000);
check(st.picked === 'S1->w16' && st.held === 'L' && L.status === 'pending', `t=5  later short S1 takes the idle 16K, L still held (${st.picked})`);
queue.push(qjob('S2', 2_000, t0 + 10_000));
st = step(t0 + 10_000);
check(st.picked === 'none', 't=10 S2 arrives, nothing idle -> queued');
w16.status = 'idle';
st = step(t0 + 20_000);
check(st.picked === 'S2->w16' && st.held === 'L', `t=20 16K frees inside the hold -> S2 takes it, L still held (${st.picked})`);
queue.push(qjob('S3', 2_000, t0 + 25_000));
st = step(t0 + LONG_JOB_HOLD_MS);
check(st.picked === 'none' && st.held === '' && queue[0] === L, 't=30 hold expires (re-check timer): nothing idle, L no longer held and first in line');
w16.status = 'idle';
st = step(t0 + 40_000);
check(st.picked === 'L->w16' && queue.some((j) => j.id === 'S3'), `t=40 first free worker after the hold goes to L, not the later S3 (${st.picked})`);
const lDispatch = log.find((e) => e.job === 'L');
check(!!lDispatch && lDispatch.atS * 1000 < 180_000, `L dispatched at ${lDispatch?.atS}s, inside the 180s queue timeout`);
// An entry still in the queue for a job that is already in flight is never picked.
queue.unshift(L);
w32.status = 'idle';
st = step(t0 + 41_000);
check(st.picked === 'S3->w32', `in-flight L left in the queue is skipped; S3 gets the idle 32K (${st.picked})`);
check(!pickedNonPending && log.filter((e) => e.job === 'L').length === 1, 'L dispatched exactly once, never while not pending');
// The same hold expiry with the 16K idle hands it to L at once.
const L2 = qjob('L2', 15_000, t0);
const q2: QJ[] = [L2, qjob('S4', 2_000, t0 + 1_000)];
const w16b: W = { id: 'w16', status: 'idle', numCtx: 16_384, tps: 40 }, w32b: W = { id: 'w32', status: 'busy', numCtx: 32_768, tps: 40 };
const inHold = pickNextDispatch(q2, [w16b, w32b], () => true, weight, t0 + LONG_JOB_HOLD_MS - 1);
const atExpiry = pickNextDispatch(q2, [w16b, w32b], () => true, weight, t0 + LONG_JOB_HOLD_MS);
check(inHold.pick?.job === q2[1] && atExpiry.pick?.job === L2, 'idle 16K: S4 gets it 1ms before the hold ends, L2 gets it the moment it ends');

console.log(failed ? '\nFAILED' : '\nall passed');
process.exit(failed ? 1 : 0);

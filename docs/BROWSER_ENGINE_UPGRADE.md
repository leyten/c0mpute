# Browser engine upgrade: web-llm 0.2.80 → 0.2.84

Runbook for the branch `eagle/browser-engine-084`. This is deploy **1 of 2**: the
engine only. The model stays `Qwen3-8B-c0mpute-q4f16_1-MLC`, so any regression is
attributable to the runtime and nothing else. Deploy 2 (`eagle/browser-model-swap`)
swaps the model on top of this.

Nothing here has been measured on our model yet — see **Unvalidated** at the bottom
before you draw any conclusion from it.

## Why

0.2.80 issues one `queue.submit()` per kernel: roughly **590 submissions to decode a
single token**. Each one is a JS→native transition, so on a browser worker the CPU
spends most of a decode step enqueueing rather than the GPU computing.

0.2.83 replaced that with a uniform buffer pool and a batched command encoder
(apache/tvm#18871): compute passes accumulate in one encoder and flush on demand,
taking the submissions per token to roughly **four**. The kernel count does not
change. That is the entire reason for the bump.

0.2.83 is also the first release that can run a hybrid-attention model at all, which
is what deploy 2 needs. Qwen3.5 is unreachable from 0.2.80 at any price.

## What changed

| | |
|---|---|
| `package.json` | `@mlc-ai/web-llm` `0.2.80` → `0.2.84` (exact pin, as before) |
| `package.json` | `patch-package` dependency + `postinstall` hook |
| `patches/@mlc-ai+web-llm+0.2.84.patch` | one-line fix for defect 1 below |
| `app/earn/engine/useWorkerEngine.ts` | model lib → `v0_2_84/base/…`, explicit `context_window_size` override, device-loss tripwire, Web Lock |
| `app/earn/engine/probe.ts` | dev-only measurement helper, off by default |
| `scripts/check-webllm-patch.sh` | build refuses to run on an unpatched engine |

### The patch, and how it actually gets applied

`patch-package` runs from `postinstall`, i.e. on `npm install` / `npm ci` and nowhere
else. Neither build path installs anything of its own:

- `scripts/build.sh` just runs `next build`;
- `scripts/deploy.sh` reinstalls **only when `package-lock.json` moved** between the
  deployed commit and the target.

The lockfile does move on this deploy, so the patch lands. It is every *later* deploy,
and any hand-built tree, where a stale `node_modules` would silently ship the unpatched
engine — a device hang in a contributor's tab, with no build failure anywhere.

`scripts/check-webllm-patch.sh` closes that. Both build paths call it first and refuse
to build without the patch:

```sh
bash scripts/check-webllm-patch.sh
# silent on success; exits 1 with instructions otherwise
```

Confirm by hand with:

```sh
grep -n 'shapeCacheSize = ' node_modules/@mlc-ai/web-llm/lib/index.js
# expect: constructor(shapeCacheSize = Infinity) {
```

`patch-package` is a `dependency`, not a devDependency, on purpose: `npm ci` inherits
`omit=dev` from `NODE_ENV=production`, which every `c0mpute-*` unit sets, and a
devDependency would make `postinstall` exit non-zero on any deploy run from such an
environment — after the tree had already moved to the new SHA.

### The model library

`v0_2_80/Qwen3-8B-q4f16_1-ctx4k_cs1k-webgpu.wasm` →
`v0_2_84/base/Qwen3-8B-q4f16_1_cs1k-webgpu.wasm`.

The lib has to move with the runtime. **Not** the `sg32` variant: measured ~1.006x
mean gain, and it can silently produce corrupted output on GPUs whose subgroup
width is not 32.

The 0.2.84 libs are compiled at `context_window_size: 40960` against our 4096 — a
10x KV cache that would OOM a 6-8GB worker if it were an allocation input. It is
not. The compiled value is a ceiling; the KV cache is sized from the runtime chat
config, which resolves (`lib/index.js:12477`) as

```
{...mlc-chat-config.json, ...ModelRecord.overrides, ...chatOpts}
```

and reaches `createKVCache` as `max_total_sequence_length`
(`lib/index.js:9937`, `:9982-90`). The wasm metadata's own `context_window_size` is
never read anywhere in the bundle. Our HF `mlc-chat-config.json` already says 4096,
so this works either way — the explicit `overrides: { context_window_size: 4096 }`
on the model record is there so that editing the config on the Hub cannot quietly
hand every browser worker a 10x KV cache.

Note the side effect, which deploy 2 does **not** use and a later change should:
from 0.2.83 the window is no longer baked into the wasm (the filename lost its
`ctx4k`), so context is now a runtime knob on the model we already run.

### Surviving the tab it runs in

Two failure modes that had no handling at all, both independent of the version bump.

**Device loss.** WebLLM builds its own `GPUDevice` and keeps it private: on loss it
logs and calls `unload()`, and nothing reaches `useWorkerEngine`. The worker stayed
registered, kept being dispatched jobs, and failed every one of them until the user
noticed. Chrome's GPU watchdog is process-wide (30s on Windows, 25s macOS), so any
tab's bad shader loses every device on the page at once — which is why a device of
our own, holding no memory, is a faithful tripwire for the case that matters. On
loss the worker unregisters, drops the engine and surfaces an error.

Test it: start the worker, then open `about:gpucrash` in another tab.

**Energy-Saver freezing.** Chrome 133+ freezes a browsing-context group when Energy
Saver is active, every page has been hidden and silent for 5 minutes, and a frame
subgroup is CPU-intensive. Freezing suspends timers, event handlers and promise
resolvers. A background browser worker is exactly that profile. Holding a Web Lock
is a documented exemption, so the worker holds one for its lifetime — in **shared**
mode, so a second worker tab on the same machine is exempt too instead of queueing
behind the first forever.

Whether freezing reaches dedicated workers is not stated in Chrome's post and has
not been tested here.

## The three known defects

### 1. web-llm #844 — shape-cache use-after-free. **PATCHED HERE.**

Open upstream, no released fix. `CacheState` builds its shape cache as

```js
class CacheState {
    constructor(shapeCacheSize = 256) {
        this.shapeCache = new LRUCache(shapeCacheSize, (_key, value) => value.dispose());
    }
```

(`lib/index.js:5049-51`) while `makeShapeTuple` (`:7328-37`) returns the cached
object as a live reference. Once the cache is full, `LRUCache.get` disposes the
least-recently-used entry — possibly one the pipeline still holds — and the next
use throws `Object has already been disposed`, taking the WebGPU device with it.

Fix: default raised to `Infinity`, so `size >= maxSize` (`:4984`) is never true and
eviction cannot fire. Safe because the shape cache converges rather than growing:
decode's only monotonically increasing quantity, `filledKVCacheLength`, never
reaches a `makeShapeTuple` call, and the per-token keys are constants. The working
set is bounded by `prefill_chunk_size` = 1024 for our model, which is exactly why
the 256 default overflows. Cost is ~1000 small tuples, tens of KB.
`CacheState.dispose()` still frees them at unload — it iterates `values()` and
disposes each, and `TVMObject.dispose` is idempotent.

Raising the cap beats deleting the dispose callback: dropping the callback would
leak every evicted tuple until page unload, whereas never evicting keeps the
unload path exactly correct.

### 2. apache/tvm#20059 — `sync()` can return before the queue drains. **NOT FIXED.**

Fixed upstream 2026-07-31, *after* 0.2.84 shipped. Not fixable without forking.

In the shipped bundle, `flushCommands()` clears `pendingGPUToCPUCopy` only inside
`if (this.pendingEncoder)` (`:4413-19`). `deviceCopyToGPU` (`:4835`) and
`deviceCopyWithinGPU` (`:4903`) call `flushCommands()` and then write to the queue
directly — so if no compute was batched at that moment, `pendingGPUToCPUCopy`
survives while the queue tail is now the newer write. `sync()` (`:4445`) takes the
fast path, awaits only the older `mapAsync`, and returns with later queue work
still in flight.

**Our exposure:** plain decode reads logits back last and samples on CPU, so the
readback *is* the queue tail and the fast path is correct. The exposed paths are
the ones that write to the GPU after the logits readback — grammar / structured
output (`:10990`, `empty().copyFrom(bitmask)`), logit processors, and logprobs.
The browser worker's `chat.completions.create` uses none of them (no `logprobs`, no
`response_format`, no logit processor), which is why this is being accepted rather
than forked around. **If anyone adds structured output or a logit processor to the
browser path, this defect becomes live** — there is a tripwire comment at the call
site in `useWorkerEngine.ts` saying so. Revisit before merging that.

### 3. apache/tvm#19342 — compositor starvation / UI jank. **NOT FIXED.**

Open, fix unmerged. Batched dispatch hands the GPU long uninterrupted command
buffers, which can starve the browser's compositor. Our workers run in a user's
**foreground tab**, so this is a real UX risk in a way it is not for a headless
benchmark: a machine that earns fine but makes the browser feel broken is a churn
problem. Watch for it explicitly during validation (below).

## How to validate

Do this on the **same machine, same browser, nothing else on the GPU**, once on
`master` (0.2.80) and once on this branch.

1. `npm ci` (this is what applies the patch), then run the app.
2. Set `NEXT_PUBLIC_ENGINE_PROBE=1` in `.env.local` and load `/earn`, start the
   worker, and wait for `ready`.
3. In the tab console: `await window.__computeEngineProbe()`.

Read the result as:

- **`decode_tokens_per_s` is the verdict.** This is where the win shows up.
- **`dispatches_per_decode_token` should be ~590 on BOTH versions.** The counter
  (`shader-submissions`) increments per `dispatchWorkgroups`, not per
  `queue.submit` (`:4734`). A flat number is expected and is *not* the fix failing
  — it is the control that says the kernel count did not change underneath us, so
  a tok/s delta is attributable to submission batching.
- **`cpu_share_of_step` should drop** if the batched-encoder hypothesis holds.
- `time_to_first_token_s` / `prefill_tokens_per_s` should not regress.

### Output equality (required — defect 2 is a correctness risk)

Throughput alone is not enough. Run the same prompts through both versions at
`temperature: 0` and diff the completions:

- a short factual prompt,
- a long one that runs to `max_tokens` (2048),
- one that trips the safety scan, to confirm the blocked path still fires,
- one multi-turn conversation, to confirm `resetChat()` + prefill still behave.

Byte-identical output is the pass condition. Divergence is a red flag, not noise:
at `temperature: 0` sampling is deterministic, so a difference means the numerics
or the sync behaviour changed.

### Also watch for

- **Compositor jank** (defect 3): scroll the page, switch tabs, move the window
  while a job is generating. Judge it by feel, not by a number.
- **Device hangs on AMD integrated GPUs** — the platform where defect 1 bit
  hardest. `Object has already been disposed` in the console means the patch did
  not apply; re-run `npm ci` and check the `grep` above.
- **KV cache size**: the console logs `Using contextWindowSize: 4096` at load. If
  it says 40960, the override did not take and the worker will OOM.
- Memory on 6-8GB cards over a long session.
- **The device-loss path**: `about:gpucrash` while the worker is ready should take
  it to an error state, not leave it registered.
- **The Web Lock**: `chrome://process-internals` shows a frozen frame. Leave a
  worker hidden for >5 minutes with Energy Saver forced on and confirm it is not.

## Rollback

- **Model lib only** (if the wasm is the problem): one line in
  `app/earn/engine/useWorkerEngine.ts` back to
  `web-llm-models/v0_2_80/Qwen3-8B-q4f16_1-ctx4k_cs1k-webgpu.wasm`. Note this is
  only coherent together with the package downgrade — the 0.2.80 lib does not run
  on the 0.2.84 runtime.
- **Everything**: revert the branch. `package.json` back to `0.2.80`, then
  `npm ci`. `patches/` and the `postinstall` hook are harmless if left behind
  (patch-package skips a patch whose version does not match the installed one),
  but the clean revert removes them — and it must also remove the
  `check-webllm-patch.sh` calls, which would otherwise fail every build on 0.2.80.
- The probe and the docs are inert; neither needs reverting.
- Tabs already running keep the engine they loaded until they reload.

## Unvalidated

Stated plainly, because none of it is implied by the above:

- **Nobody has run 0.2.84 against our model on a real GPU.** No tok/s number,
  before or after, has been measured on `Qwen3-8B-c0mpute-q4f16_1-MLC`. The
  throughput claim is upstream's, on upstream's models.
- **The ~590 → ~4 submissions figure is upstream's**, not ours.
- **The #844 fix is reasoned, not observed.** The argument that the shape cache
  converges is from reading the decode path; no one has instrumented
  `shapeCache.size` over a long generation to confirm it plateaus, and no one has
  reproduced the original crash and then watched the patch stop it.
- **Output equality has not been checked.** Defect 2 is the reason it must be.
- **Compositor jank has not been observed either way** on our worker page.
- **The probe itself has never been executed** — it typechecks, and every API it
  touches was verified by reading the installed bundle, but it has not run against
  a live engine.
- **The `overrides` path was verified by reading the bundle, not by loading a
  model.** No one has seen `Using contextWindowSize: 4096` printed with the 40960
  lib in place.
- **The device-loss tripwire and the Web Lock have not been exercised in a
  browser.** Both are small and both are guarded, but neither has been seen to
  fire.

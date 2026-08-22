# Building the browser worker's model

How to go from HuggingFace weights to the MLC q4f16_1 model directory that
browser workers download. Written for the Qwen3-8B → Qwen3.5-9B swap, but the
shape of the job is the same for any future model.

We compile **weights only**. We do not compile the WebGPU model library (the
`.wasm`) — we reuse a prebuilt one from `mlc-ai/binary-mlc-llm-libs`. That is
the whole reason this is a one-sitting job rather than an emscripten toolchain
project.

Everything below was checked against primary sources on 2026-08-09. Values
marked UNVERIFIED could not be confirmed and must be checked on the box.

## Four corrections, 2026-08-21

The body is unchanged and still correct. These four things moved after it was
written, and they change what you build rather than how.

1. **Build the 4B as well, in the same sitting.** `Qwen3.5-4B` is 3868 MB and a
   2.39 GB download, against 6433 MB and 5.06 GB for the 9B — and it still beats
   the Qwen3-8B this replaces by a wide margin. It brings 4-6GB cards into the
   worker pool, which is the largest supply expansion available anywhere in this
   work. Same runbook, same `qwen2` template, same stop-id patch, same §7 check,
   one more `convert_weight` run on a box that is already provisioned; the
   prebuilt lib is `v0_2_84/base/Qwen3.5-4B-q4f16_1_cs1k-webgpu.wasm`. Publish it
   as `Leyten/Qwen3.5-4B-compute-q4f16_1-MLC`. The worker picks between the two
   rungs by sizing the GPU at start — there is no user choice.
2. **The uncensored source: prefer Heretic.** §3 targets
   `huihui-ai/Huihui-Qwen3.5-9B-abliterated`, which flags its own method as "a
   crude, proof-of-concept implementation to remove refusals". `Heretic`
   (p-e-w) does the same job by TPE-optimised directional ablation that
   co-minimises refusals and KL divergence from the base, and
   `Kewk/Heretical-Qwen3.5-9B` publishes 3/100 refusals at KL 0.0366 — roughly
   3x less capability damage for the same decensoring. Build Kewk as primary,
   huihui as fallback, and decide on the §9 A/B rather than on the KL number:
   huihui has months of community validation that the Heretic builds do not.
   Everything else in this runbook applies unchanged either way. At the 4B rung
   start with huihui — p-e-w's own 4B Heretic build only takes refusals 93→40.
3. **The runtime is no longer a blocker.** §0 was written against a repo pinned
   to web-llm 0.2.80. The engine deploy that precedes this one moves to 0.2.84,
   so hybrid attention is supported and §0 is now background rather than a gate.
4. **The id says `compute`, not `c0mpute`.** See §8 — and note the two strings
   are unrelated as substrings, so the orchestrator matcher carries both.

One thing this runbook never settled and still has not: WebLLM's own prebuilt
entry for Qwen3.5-9B sets `overrides: { context_window_size: 4096,
max_history_size: 1 }`, two fields. We set only the first. Whether
`max_history_size` is load-bearing for the hybrid RNN-state path is untested.

---

## 0. Read this first — the blocker

**Qwen3.5-9B cannot run on `@mlc-ai/web-llm` 0.2.80.** It needs **>= 0.2.83**.

Qwen3.5 is a hybrid-attention model: 24 GatedDeltaNet (linear-attention) layers
and 8 full-attention layers, `model_type: "qwen3_5"`. Its model library declares
`"kv_state_kind": "hybrid"` and exports `batch_prefill`, `batch_decode`,
`create_tir_paged_kv_cache` and `create_rnn_state` — but **no single-sequence
`prefill`/`decode`**. Published web-llm 0.2.80/0.2.81/0.2.82 contain no
`kv_state_kind` handling at all: they look up `prefill`/`decode` unconditionally
and only ever build a paged KV cache, so the 24 recurrent layers would have no
state even if construction survived. Hybrid support (`resolveModelABI`,
`create_rnn_state`) first appears in **0.2.83**, which is therefore the true
floor; 0.2.84 is npm `latest`. (0.2.81 and 0.2.82 are byte-identical bundles.)

**Know the failure signature**, because it does not name the problem. Under
0.2.80, `vm.getFunction("prefill")` does not throw — it returns `undefined`.
The crash happens one layer out, in `detachFromCurrentScope(undefined)`, which
throws **`Value attached to scope multiple times`** once two undefined slots
accumulate. That error mentions neither the model nor the missing function, and
it fires on `prefill` rather than `decode`. Anyone who sees it in a browser
console will go hunting a memory-scope bug. This was reproduced by running the
real 0.2.80 runtime against the real Qwen3.5 wasm, not inferred.

So this model swap is **coupled to the web-llm upgrade**. Land the 0.2.84 branch
first. The wasm-level ABI is not the problem: the Qwen3.5 lib's import table is
byte-identical to the v0_2_84 Qwen3-8B lib's, its exports are identical in name
and kind (the section bytes differ only in function indices), and v0_2_84 libs
import a strict subset of what v0_2_80 libs do. The blocker is purely the
JavaScript runtime layer.

---

## 1. What the box needs

| Resource | Need | Why |
|---|---|---|
| Disk | **60 GB free** | 19.31 GB bf16 source + 5.04 GB q4f16_1 output + HF cache duplication + slack |
| RAM | **32 GB** | `convert_weight` streams safetensors shards; the largest is 5.37 GB |
| GPU | any CUDA card with **>= 8 GB VRAM** | quantization runs per-tensor; largest single source tensor is `lm_head` at 1.89 GiB bf16 |
| Python | see §2 | must match the mlc_llm wheel |

A GPU is used for quantization but the job is not heavy — it is bounded by disk
and download speed, not compute. Budget ~1 hour end to end, most of it spent
pulling 19 GB from HuggingFace and pushing 5 GB back.

Exact source sizes, from the HF file tree:

- `huihui-ai/Huihui-Qwen3.5-9B-abliterated` — 4 shards, **19,306,310,880 bytes**
  (the index reports `total_size` 19,306,216,416). Note the non-standard
  filenames: `model.safetensors-0000N-of-00004.safetensors`.
- Expected output — **5,038,043,136 bytes** of `params_shard_*.bin` across 127
  shards, plus tokenizer files; **5.06 GB / 4.71 GiB** for the whole repo.

---

## 2. Install mlc_llm

Verbatim from https://llm.mlc.ai/docs/install/mlc_llm.html. The docs recommend
Python 3.13 and require `git-lfs`.

```bash
conda create --name mlc-prebuilt python=3.13
conda activate mlc-prebuilt
conda install -c conda-forge git-lfs

# CUDA 12.8 box (pick the variant matching the driver: cu128 / cu130 / rocm61 / rocm62)
python -m pip install --pre -U -f https://mlc.ai/wheels mlc-llm-nightly-cu128 mlc-ai-nightly-cu128
```

There is a CPU-only pair (`mlc-llm-nightly-cpu mlc-ai-nightly-cpu`) if you have
to convert without a GPU. Speed of that path is UNVERIFIED — assume much slower.

Verify:

```bash
mlc_llm --help          # usage: ... {compile,convert_weight,gen_config}
python -c "import tvm; print(tvm.__file__)"
```

**Which version?** The v0_2_84 model libraries were built from mlc-llm commit
`2008fe83` (2026-05-11, `v0.20.dev0-166`) against apache/tvm `bc1a904e`. No
published nightly maps to that commit — the wheel index carries `0.20.dev*` and
`0.26.dev*`. We are not compiling a wasm, so we do not need to reproduce that
toolchain exactly; we only need the converted parameters to match what the
prebuilt lib expects. §7 checks precisely that. Start with the current nightly;
if §7 fails, fall back to a `0.20.dev*` build.

---

## 3. The model

We build `huihui-ai/Huihui-Qwen3.5-9B-abliterated` — the abliterated (refusal
behavior removed) build of `Qwen/Qwen3.5-9B`.

It is worth knowing exactly how it differs from stock, because it changes what
can go wrong: **`config.json`, `tokenizer_config.json`, `chat_template.jinja` and
`model.safetensors.index.json` are byte-identical to `Qwen/Qwen3.5-9B`** (same
md5s). Only the four safetensors shards differ, and they have identical byte
sizes. It is a pure weight edit with zero architectural change, so conversion
behaves exactly as it does for the base model, and the tokenizer needs no
special handling.

Two things about the source repo that surprise people:

- `architectures: ["Qwen3_5ForConditionalGeneration"]` — it is packaged as a
  vision-language model. All the text parameters live under `text_config`, and
  `rope_theta`/`partial_rotary_factor` are nested under `rope_parameters`.
  mlc_llm's `Qwen35Config.__post_init__` hoists these; conversion drops the 333
  `model.visual.*` tensors and the 15 `mtp.*` tensors, leaving a text-only model.
  The published `mlc-ai/Qwen3.5-9B-q4f16_1-MLC` confirms this: 581 parameters,
  zero `visual.*`, zero `mtp.*`.
- There is **no `generation_config.json`** in either the abliterated repo or the
  base. This is why the published MLC configs have nonsense sampling defaults —
  see §6.

---

## 4. Convert the weights

Download first. The MLC docs use git-lfs:

```bash
mkdir -p dist/models && cd dist/models
git lfs install
git clone https://huggingface.co/huihui-ai/Huihui-Qwen3.5-9B-abliterated
cd ../..
```

(`huggingface-cli download` resumes better over a flaky link; check its exact
flags with `--help` on the box — UNVERIFIED here.)

Then convert. Flags below are read from
`python/mlc_llm/cli/convert_weight.py`; `--quantization` and `--output/-o` are
the only required ones, everything else defaults to `auto`:

```bash
mlc_llm convert_weight ./dist/models/Huihui-Qwen3.5-9B-abliterated/ \
    --quantization q4f16_1 \
    --device auto \
    -o dist/Qwen3.5-9B-compute-q4f16_1-MLC
```

- `--model-type` defaults to `auto` and detects from `config.json`'s
  `model_type`, which is `qwen3_5`. `qwen3_5` and `qwen3_5_text` are both
  registered in mlc_llm's model registry, mapping to
  `qwen35_model.Qwen35LMHeadModel`. Pass `--model-type qwen3_5` explicitly if
  detection misfires on the VLM `architectures` value.
- `--device` "will detect from local available GPUs if not specified"; pass
  `--device cuda:0` to pin.
- `--source-format` defaults to `auto` and will resolve to
  `huggingface-safetensor`.

Watch item: this repo's shards are named
`model.safetensors-0000N-of-00004.safetensors`, not the conventional
`model-0000N-of-00004.safetensors`. The loader goes through
`model.safetensors.index.json`, whose `weight_map` points at the real names, so
it should be fine — but if conversion cannot find weights, this is the first
thing to check.

Expected result: 127 `params_shard_*.bin` totalling 5,038,043,136 bytes, and a
`tensor-cache.json` reporting `ParamSize: 581`.

---

## 5. Generate the config

Flags read from `python/mlc_llm/cli/gen_config.py`. Note `--conv-template` is
**required** and argparse-validated against the registered template list, so a
typo is rejected rather than silently written.

```bash
mlc_llm gen_config ./dist/models/Huihui-Qwen3.5-9B-abliterated/ \
    --quantization q4f16_1 \
    --conv-template qwen2 \
    --context-window-size 4096 \
    --prefill-chunk-size 1024 \
    -o dist/Qwen3.5-9B-compute-q4f16_1-MLC/
```

`--conv-template qwen2` is deliberate and is explained in §6 — do not use
`qwen3_5`. Other flags that exist and we leave at their defaults:
`--sliding-window-size`, `--attention-sink-size`, `--tensor-parallel-shards`,
`--pipeline-parallel-stages`, `--disaggregation`, `--max-batch-size` (128).

`gen_config` writes the **fully serialized** conversation object into
`conv_template` (`conversation_reg.to_json_dict()`), not a name string. There is
no CLI flag to override `stop_token_ids`, which is why §6 patches the JSON.

This step also copies the tokenizer files into the output directory.

---

## 6. Fix `mlc-chat-config.json` — do not skip this

`gen_config` gets three things wrong for Qwen3.5, and the published
`mlc-ai/Qwen3.5-9B-q4f16_1-MLC` ships all three. Do not use it as a reference.

**(a) The stop token ids are from a different vocabulary.** Every published
Qwen3.5 MLC repo (0.8B, 2B, 4B, 9B q4f16_1 and q4f32_1) ships
`conv_template.stop_token_ids: [151643, 151645]`. Those are Qwen2/Qwen3 ids. In
Qwen3.5's 248,320-token vocabulary they are ordinary subword tokens — 151643 is
a Korean fragment and 151645 a Thai one, both verified against
`tokenizer.json`. The correct ids are:

| token | id |
|---|---|
| `<|endoftext|>` | 248044 |
| `<|im_start|>` | 248045 |
| `<|im_end|>` | 248046 |

This cuts both ways. The true EOS ids never fire, so termination falls back to
web-llm's `stop_str` match on `"<|im_end|>"` — a later, weaker trigger that can
leak the stop string into output. And because 151643/151645 are perfectly
emittable text, any answer that happens to contain that Korean or Thai token
truncates mid-sentence for no visible reason.

The root cause is that `mlc-llm/conversation_template/qwen2.py` hardcodes
`stop_token_ids=[151643, 151645]` — Qwen3-8B's EOS pair, copied verbatim. It is
correct for the model that template was written for, and wrong for this one.

**(b) `prefill_chunk_size` disagrees with the model library.** The published
config says 2048; the prebuilt wasm we use is `cs1k`, compiled at 1024. It must
be **1024**.

**(c) `pad`/`bos`/`eos_token_id` are 0/1/2.** These come from
`MLC_CHAT_SYSTEM_DEFAULT` because there is no `generation_config.json` to read
and `config.json` has no top-level `eos_token_id` (it is inside `text_config`).
They decode to `!`, `"`, `#`. web-llm never reads `eos_token_id` or
`pad_token_id` — it derives stopping entirely from `conv_template` — so these
are book-keeping only, but ship them correct anyway.

### The conv template — a real trap

mlc_llm registers `qwen3_5` and `qwen3_5_nothink` templates. **Do not use
them.** Their assistant role strings bake the thinking state into the prompt
prefix, and that collides with how web-llm toggles thinking at request time.

web-llm renders the final assistant turn one of two ways:

| request | rendered |
|---|---|
| `enable_thinking` unset/true | `roles.assistant + role_empty_sep` |
| `enable_thinking: false` | `roles.assistant + role_content_sep + "<think>\n\n</think>\n\n"` |

The ground truth to match is the model's own Jinja template, rendered here with
`jinja2` for a `[system, user]` conversation and `add_generation_prompt=True`:

| | assistant prefix |
|---|---|
| HF template, thinking on | `'<\|im_start\|>assistant\n<think>\n'` |
| HF template, `enable_thinking=False` | `'<\|im_start\|>assistant\n<think>\n\n</think>\n\n'` |

Combine web-llm's two rendering rules with each candidate template's
`roles.assistant` and compare byte-for-byte:

| conv_template | thinking on | thinking off |
|---|---|---|
| `qwen2` (`<\|im_start\|>assistant`) | `…assistant\n` — no `<think>` prefill | `…assistant\n<think>\n\n</think>\n\n` ✅ exact |
| `qwen3_5` (`<\|im_start\|>assistant\n<think>`) | `…assistant\n<think>\n` ✅ exact | `…assistant\n<think>\n<think>\n\n</think>\n\n` ❌ doubled |
| `qwen3_5_nothink` | `…<think>\n\n</think>\n\n` ❌ never thinks | ❌ doubled empty block |

No single template is exact in both directions — the thinking state is baked
into the role string, so it cannot be. **`qwen2` is the right choice because it
is exact on the path we actually use.** Pro is non-thinking on every route, so
the off path is the one that must be byte-correct, and it is.

The cost is that `qwen2` with thinking *on* omits the `<think>\n` opener, so the
model would have to emit it itself. Note the HF default is thinking-**on**, so
this is the branch that diverges from upstream. If we ever enable thinking on
the browser tier, revisit — that is the case `qwen3_5` is exact for.

**The alternative worth knowing about:** `qwen3_5_nothink`'s *reply-header* path
(thinking unset) renders exactly HF's thinking-off tail, and the template
already carries the correct `stop_token_ids: [248046, 248044]`, so it needs no
JSON patch at all. The catch is that it only works if the worker stops sending
`enable_thinking: false` — with the flag set it doubles the empty block, same as
`qwen3_5`. That means touching shipped worker code and giving up the toggle
permanently. We take the `qwen2` route because it leaves
`useWorkerEngine.ts` untouched and keeps the switch live; revisit if the
per-build JSON patch ever becomes a maintenance problem.

So: generate with the `qwen2` conv template and patch the stop token ids. That
is also what our current production Qwen3-8B build does, and it has been fine —
for Qwen3-8B the qwen2 template's stop ids happen to be the correct ones.

(`strip_reasoning_in_history`, which the `qwen3` template sets, is not
implemented by web-llm at all — the string does not appear in 0.2.80 or 0.2.84.
The worker already strips `<think>` blocks from history itself in
`useWorkerEngine.ts`.)

### The config we ship

Apply this after `gen_config`, then diff the result against the file below:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("dist/Qwen3.5-9B-compute-q4f16_1-MLC/mlc-chat-config.json")
c = json.loads(p.read_text())

c["context_window_size"] = 4096
c["prefill_chunk_size"]  = 1024
c["model_config"]["context_window_size"] = 4096
c["model_config"]["prefill_chunk_size"]  = 1024

# stop tokens for Qwen3.5's vocabulary
c["conv_template"]["stop_token_ids"] = [248046, 248044]

# book-keeping ids (web-llm ignores these, but 0/1/2 is simply wrong)
c["pad_token_id"] = 248044
c["bos_token_id"] = 248044
c["eos_token_id"] = [248046, 248044]

# sampling: identical to the current production Qwen3-8B build, so the A/B in
# §9 isolates the model change. Qwen's own non-thinking recommendation is
# temperature 0.7 / top_p 0.8 / top_k 20 / presence_penalty 1.5 — worth trying,
# but as a separate experiment, not bundled into the swap.
c["temperature"]        = 0.6
c["top_p"]              = 0.95
c["presence_penalty"]   = 0.0
c["frequency_penalty"]  = 0.0
c["repetition_penalty"] = 1.0

p.write_text(json.dumps(c, indent=2) + "\n")
print("patched")
PY
```

The `conv_template` block must end up as the qwen2 ChatML shape with corrected
stop ids:

```json
"conv_template": {
  "name": "qwen2",
  "system_template": "<|im_start|>system\n{system_message}<|im_end|>\n",
  "system_message": "You are a helpful assistant.",
  "system_prefix_token_ids": null,
  "add_role_after_system_message": true,
  "roles": { "user": "<|im_start|>user", "assistant": "<|im_start|>assistant" },
  "role_templates": { "user": "{user_message}", "assistant": "{assistant_message}", "tool": "{tool_message}" },
  "messages": [],
  "seps": ["<|im_end|>\n"],
  "role_content_sep": "\n",
  "role_empty_sep": "\n",
  "stop_str": ["<|endoftext|>", "<|im_end|>"],
  "stop_token_ids": [248046, 248044],
  "function_string": "",
  "use_function_calling": false
}
```

### Why 4096

The prebuilt Qwen3.5 lib is compiled for the model's full 262,144-token window,
so unlike the Qwen3-8B `ctx4k` lib it replaces, the ceiling now comes from this
config rather than from the wasm. We set 4096 to cap KV-cache VRAM and to keep a
worst-case generation inside the orchestrator's 180s job timeout.

This is not cosmetic. web-llm calls
`create_tir_paged_kv_cache(max_num_sequence=1, max_total_sequence_length=contextWindowSize,
prefill_chunk_size, page_size=16, support_sliding_window)`, taking
`contextWindowSize` straight from `mlc-chat-config.json`. **Ship the published
262144 and you allocate 8 GiB of KV cache**, which no browser worker survives.
Patching this value is the single highest-consequence line in §6.

The KV cache covers only the 8 full-attention layers (4 KV heads, head_dim 256),
so at f16 it is `2 × 8 × 4 × 256 × 2 = 32 KiB` per token:

| context | KV cache |
|---|---|
| 4,096 | 128 MiB |
| 8,192 | 256 MiB |
| 32,768 | 1,024 MiB |
| 262,144 (native) | 8,192 MiB |

That is dramatically cheaper than the model it replaces — Qwen3-8B has 36
full-attention layers with 8 KV heads at head_dim 128, i.e. 144 KiB per token,
so **576 MiB at the same 4k window**. Context is no longer the thing that
constrains us; see §9 for what is.

These figures are idealized. TVM rounds up to whole 16-token pages and adds one
(`num_total_pages = ceil(capacity / page_size) + 1`), so the real allocation is
~0.5 MiB above the 4k row here and ~2.25 MiB above the Qwen3-8B one. They also
assume the KV dtype is float16, which is standard for `q4f16_1` and consistent
with everything observed but is not stated in the lib metadata.

The GatedDeltaNet layers hold a fixed-size recurrent state instead, allocated by
`create_rnn_state(max_num_sequence=1, max_history_size=1)` and independent of
context length. Its size is **UNVERIFIED** — the per-layer state shapes are baked
into the compiled relax bytecode, the JS passes only those two scalars, and
`memory_usage.create_rnn_state: 0` is scratch workspace, not the state itself.
Deriving it from the `linear_*` config fields would be inference, not
measurement. Measure it in a real browser run.

---

## 6b. Thinking mode

Qwen3.5 thinks by default. Its model card is explicit: *"Qwen3.5 models operate
in thinking mode by default"*, and *"Qwen3.5 does not officially support the
soft switch of Qwen3, i.e. `/think` and `/nothink`."* There is no prompt-level
escape — the only documented switch is the template's `enable_thinking` flag.

On a paid network this is a cost question, not a preference. Reasoning tokens
are generated, billed as worker time, and thrown away. The worker already passes
`extra_body: { enable_thinking: think }`, and `think` is false on every Pro path
(the chat UI's Pro plan sets `thinking: false`; the API maps `c0mpute-pro` to
`think: false`).

**With the `qwen2` conv template from §6, that switch works correctly.**
web-llm's `enable_thinking: false` prefills `<think>\n\n</think>\n\n` after the
assistant role string, producing exactly the byte sequence the HF template
produces for `enable_thinking=False` — verified by rendering the template, not
by inspection. This is the same mechanism our Qwen3-8B build already relies on
(`appendEmptyThinkingReplyHeader` is identical in 0.2.80 and 0.2.84), so nothing
new is required.

If a future template change breaks that composition, the escape hatch is
`engine.completions.create({ prompt })` — the text-completion path, which sets
`isTextCompletion` and routes through `getPromptArrayTextCompletion`, bypassing
conversation templating entirely. That lets us hand-write the prompt ending in a
partial assistant turn. It is strictly a fallback: it would move prompt
construction into our code and we would own it forever.

---

## 7. Verify before uploading

The single most valuable check: the prebuilt wasm embeds the exact parameter
list it expects. If your converted weights match it, the model will load.

```bash
python3 - <<'PY'
import json, urllib.request, pathlib

WASM = "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_84/base/Qwen3.5-9B-q4f16_1_cs1k-webgpu.wasm"
OUT  = pathlib.Path("dist/Qwen3.5-9B-compute-q4f16_1-MLC")

blob = urllib.request.urlopen(WASM).read().decode("latin1")
i = blob.index('{"model_type"')
d = 0
for j in range(i, len(blob)):
    if blob[j] == "{": d += 1
    elif blob[j] == "}":
        d -= 1
        if d == 0:
            meta = json.loads(blob[i:j+1]); break

want = {(p["name"], tuple(p["shape"]), p["dtype"]) for p in meta["params"]}

cache = json.loads((OUT / "tensor-cache.json").read_text())
got = {(r["name"], tuple(r["shape"]), r["dtype"])
       for shard in cache["records"] for r in shard["records"]}

print("lib expects", len(want), "params; build has", len(got))
print("MATCH" if want == got else "MISMATCH")
for n in list(want - got)[:5]: print("  missing:", n)
for n in list(got - want)[:5]: print("  extra:  ", n)

cfg = json.loads((OUT / "mlc-chat-config.json").read_text())
assert cfg["prefill_chunk_size"] == meta["prefill_chunk_size"], "prefill_chunk_size must match the lib"
assert cfg["context_window_size"] <= meta["context_window_size"]
assert cfg["quantization"] == meta["quantization"]
assert cfg["model_type"] == meta["model_type"]
assert cfg["conv_template"]["stop_token_ids"] == [248046, 248044]
print("config OK")
PY
```

Expect **581 parameters**. Ordering does not matter — MLC loads by name — but
the set of `(name, shape, dtype)` must be identical. This was confirmed against
the published `mlc-ai/Qwen3.5-9B-q4f16_1-MLC`, whose 581 parameters match the
wasm exactly.

If this reports MISMATCH, your `mlc_llm` is a different generation from the one
that built the v0_2_84 libs and has changed the `qwen3_5` parameter layout. See
§10.

The output directory must contain `tensor-cache.json` — **not**
`ndarray-cache.json`. Both web-llm 0.2.80 and 0.2.84 fetch `tensor-cache.json`
and never reference `ndarray-cache.json`. Our current production repo uses
`tensor-cache.json`, so a current mlc_llm produces the right thing.

---

## 8. Upload

Create `Leyten/Qwen3.5-9B-compute-q4f16_1-MLC` on HuggingFace first, then the
documented flow:

```bash
git lfs install
git clone https://huggingface.co/Leyten/Qwen3.5-9B-compute-q4f16_1-MLC
cd Qwen3.5-9B-compute-q4f16_1-MLC
cp path/to/dist/Qwen3.5-9B-compute-q4f16_1-MLC/* .
git add . && git commit -m "Add Qwen3.5 9B abliterated q4f16_1 MLC weights"
git push origin main
```

5 GB across 127 shards over git-lfs is the slowest and most failure-prone step.
`huggingface-cli upload` resumes more gracefully; its exact syntax is UNVERIFIED
here, check `--help` on the box.

The published repo must contain, mirroring
`Leyten/Qwen3-8B-c0mpute-q4f16_1-MLC`:

- `params_shard_*.bin` (127 of them)
- `tensor-cache.json`
- `mlc-chat-config.json`
- `tokenizer.json`, `tokenizer_config.json`, `vocab.json`, `merges.txt`

`tensor-cache-b16.json`, which the mlc-ai repos also carry, is not read by
web-llm and can be omitted.

The app already points at it — `CUSTOM_MODELS` in
`app/earn/engine/useWorkerEngine.ts` names both rungs.

**The model id must contain the substring `compute`.** `workerServesModel` in
`lib/orchestrator/types.ts` admits a browser worker to a browser-lane job only
if `worker.model` contains `compute`, `c0mpute` or `dolphin`, and the worker
registers with the id from `AVAILABLE_MODELS`. Name the repo something like
`Qwen3.5-9B-abliterated-q4f16_1-MLC` and every browser worker silently stops
receiving jobs — they connect, report ready, and are never selected.
`Qwen3.5-9B-compute-q4f16_1-MLC` keeps the convention. Note that `c0mpute` is
NOT a substring of `compute`: they are separate entries in that matcher, and
both stay while tabs on the old build are still serving.

Note that web-llm caches weights keyed by **model URL**, not model id. Publishing
under a new repo name means every worker re-downloads 4.7 GB once; it also means
the old model stays cached, so a rollback is cheap for returning workers.

---

## 9. Validating the swap before Pro flips over

Do not flip Pro on a vibe check. Run both builds side by side in two browser
tabs, pointed at the same prompts, with `enable_thinking: false` — which is what
Pro always sends, from both the chat UI (`thinking: false` on the Pro plan) and
the API (`c0mpute-pro` maps to `think: false`).

What to compare, current `Leyten/Qwen3-8B-c0mpute-q4f16_1-MLC` vs the new build:

1. **Refusal rate — this is the gate.** The tier is sold as uncensored. Run the
   same set of prompts that the current build answers and confirm the new one
   does too. huihui-ai describes its own method as "a crude, proof-of-concept
   implementation to remove refusals"; abliteration quality varies per release
   and is not guaranteed to be as thorough as the Qwen3-8B build we run today.
   A regression here is a product regression, not a nitpick.
2. **Quality** on real traffic-shaped prompts, not benchmarks. We have no
   trustworthy published number for this specific abliterated build, and a
   quoted benchmark for stock Qwen3.5-9B would not transfer to it anyway.
3. **tok/s** on the same GPU, same tab, after warmup. The worker benchmarks this
   at startup and the orchestrator weights job assignment by it, so a
   regression costs the whole network throughput, not just one worker.
4. **VRAM headroom.** The lib's own metadata estimates a `batch_decode`
   workspace of 690 MB against Qwen3-8B's 95 MB, and the model runs the batch
   ABI rather than the single-sequence one. Weights are also larger (4.71 vs
   4.31 GiB). The KV cache is much smaller (128 vs 576 MiB), so the totals land
   close — but "close" is a prediction, and whether that workspace is actually
   committed is **UNVERIFIED**. Measure a real tab on an 8 GB card before
   claiming the 6 GB guidance in the docs still holds.
5. **Stop behavior.** Confirm no `<|im_end|>` leaks into output and that
   responses terminate rather than running to `max_tokens`.

### Rollback

Revert the staging commit and redeploy. The load-bearing line is the `url` in
`CUSTOM_MODELS`; pointing it back at
`https://huggingface.co/Leyten/Qwen3-8B-c0mpute-q4f16_1-MLC/resolve/main` (with
the matching `v0_2_80` wasm and model id) restores the old model, and returning
workers still have it cached.

Note the rollback is a deploy, not a switch: workers already running keep the
model they loaded until the tab reloads.

---

## 10. What can still go wrong on the GPU box

- **mlc_llm version skew changes the parameter layout.** The v0_2_84 libs were
  built from mlc-llm commit `2008fe83` (2026-05-11, `v0.20.dev0-166`). No
  published pip nightly maps to that commit — the index carries `0.20.dev*` and
  `0.26.dev*`. If a current nightly renames or reshapes any `qwen3_5` parameter,
  the §7 check fails and the weights will not load against the prebuilt wasm.
  This is the most likely failure and the reason §7 exists. Fallback: install an
  older `0.20.dev*` nightly and re-run the conversion.
- **`qwen3_5` support is newer than the rest of the toolchain.** If the wheel you
  install predates it, `convert_weight` will not recognize the model type at all.
- **The VLM wrapper.** Conversion has to hoist `text_config` and drop the vision
  and MTP tensors. If your mlc_llm version lacks that handling it will either
  fail on the unexpected `architectures` value or convert 775 tensors instead of
  581 — §7 catches the latter.
- **Disk.** 19 GB in, 5 GB out, plus the HF cache keeping its own copy. 60 GB is
  not padding.
- **HF upload of 5 GB across 127 shards** is the slowest step and the one most
  likely to fail halfway. Whatever tool you use must resume.
- **The build box cannot test the result.** WebGPU is a browser API; a headless
  CUDA box cannot load the wasm. Verification on the box is §7 (structural) only
  — the first real load happens in a browser.
- **`active_vocab_size` 248077 vs padded `vocab_size` 248320.** web-llm sizes its
  grammar bitmask from `vocab_size`. Leave both as `gen_config` writes them.

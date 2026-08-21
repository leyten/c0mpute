---
sidebar_position: 6
title: API
---

# Inference API

Compute Network exposes an **OpenAI-compatible** HTTP API — built for **agents**. It speaks chat completions, streaming, tool/function calling, and model discovery, so any agent framework that talks to OpenAI works by changing two things: the `base_url` and the `api_key`. Nothing else changes.

```
base_url:  https://c0mpute.ai/api/v1
```

Why run your agent on Compute Network: **uncensored** models (no refusals), **decentralized** compute, large context, and your prompts are **never stored** (processed in memory and discarded — only token counts are kept for billing) and **anonymous to the worker** (the GPU running your job gets the prompt text only, never your identity). See [Building agents](#building-agents) for framework setups.

## Authentication

Generate an API key at **[c0mpute.ai/settings](https://c0mpute.ai/settings)** → the **API** tab. Keys look like `sk-c0mpute-…` and are shown once on creation. Pass it as a bearer token:

```
Authorization: Bearer sk-c0mpute-...
```

Requests are billed to the credit balance of the account that owns the key. Top up with USDC from the dashboard.

## Models

| Model | Description |
| --- | --- |
| `qwen3.8-27b-uncensored` | Uncensored Qwen3.8 27B with tools, vision, and large context. The network's model — it also powers [c0mpute code](/c0mpute-code). |
| `qwen3.8-27b-uncensored-think` | The same model with extended chain-of-thought reasoning. |
| `c0mpute-pro` | Uncensored 8B. Fast, runs on the broad browser worker pool. |
| `c0mpute-swarm` | MiniMax-M2.5 (229B), served by the decentralized GPU swarm. Availability depends on a swarm ring being ready. |

`GET /v1/models` lists them with a live `available` flag (the 27B requires a native GPU worker to be online) and a `pricing` object (`{ "type": "per_token", "usd_per_m_input": 0.15, "usd_per_m_output": 0.90 }`). Always check availability if you depend on the 27B.

> The older model ids (`c0mpute-max`, `supergemma4-26b`, `code`) are deprecated aliases. They still answer during the migration window and will be removed — point new integrations at the ids above.

## Pricing

Billing is **per token**, one rate card for every text model:

| | USD / 1M tokens |
| --- | --- |
| Input | $0.15 |
| Output | $0.90 |

Thinking tokens are output tokens and carry no surcharge, so
`qwen3.8-27b-uncensored-think` costs the same per token as the base model — it
simply tends to generate more of them.

1 credit = $0.001, and a request is rounded up to whole credits with a floor of
1, so a typical message (~1,200 in / ~600 out) costs about 1 credit. Credits are
bought with USDC from the [dashboard](https://c0mpute.ai/settings) at 500 credits
per dollar. Every response carries a `usage` block with the counts you were
actually billed on; streaming responses include it in a final chunk when you send
`"stream_options": {"include_usage": true}`. A request that returns a tool call
(one step of an agent loop) bills for the tokens it generated. Rate limit: 60
requests/minute per key.

Because the final cost is only known once the answer stops, a request places a
short-lived **hold** for the largest it could cost, and the unused part is
returned the moment it settles. A balance check should allow for the hold, not
just the typical cost.

## Balance

`GET /v1/balance` returns the credit balance left on the account that owns the key:

```bash
curl https://c0mpute.ai/api/v1/balance \
  -H "Authorization: Bearer $C0MPUTE_API_KEY"
```

```json
{
  "object": "balance",
  "credits": 12500,
  "usd": 12.50,
  "total_deposited": 20000,
  "total_spent": 7500
}
```

Use it to check remaining credit before a batch of requests or to surface a low-balance warning in your integration.

## Image generation

`POST /v1/images/generations` — OpenAI-compatible, uncensored image generation (Chroma1-HD on contributor GPUs). 10 credits ($0.01) per image. Images are returned inline as base64 and **never stored** server-side.

```bash
curl https://c0mpute.ai/api/v1/images/generations \
  -H "Authorization: Bearer $C0MPUTE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a neon-lit alley in the rain, cinematic", "size": "1024x1024"}'
```

```python
from openai import OpenAI
client = OpenAI(base_url="https://c0mpute.ai/api/v1", api_key="sk-c0mpute-...")
img = client.images.generate(prompt="a neon-lit alley in the rain, cinematic", response_format="b64_json")
png_b64 = img.data[0].b64_json
```

Parameters: `prompt` (required), `size` ("WIDTHxHEIGHT", default 1024x1024), `negative_prompt`, `seed`, `nsfw` (boolean, default false — SFW mode runs an output classifier; the absolute safety line is enforced in both modes). `n` must be 1 and `response_format` must be `b64_json` (no URLs — nothing is stored). Renders take ~30s; errors use OpenAI shapes (`402 insufficient_credits`, `503` when no image GPU is free).

## Chat completions

`POST /v1/chat/completions`

### curl

```bash
curl https://c0mpute.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $C0MPUTE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "c0mpute-pro",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(base_url="https://c0mpute.ai/api/v1", api_key="sk-c0mpute-...")

resp = client.chat.completions.create(
    model="c0mpute-pro",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(resp.choices[0].message.content)
```

### Node (OpenAI SDK)

```js
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "https://c0mpute.ai/api/v1", apiKey: "sk-c0mpute-..." });

const resp = await client.chat.completions.create({
  model: "c0mpute-pro",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(resp.choices[0].message.content);
```

## Streaming

Set `stream: true` to receive Server-Sent Events as `chat.completion.chunk` objects, terminated by `data: [DONE]`.

```python
stream = client.chat.completions.create(
    model="c0mpute-pro",
    messages=[{"role": "user", "content": "Write a haiku."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
```

## Function calling (tools)

Pass your own `tools`. When the model decides to call one, the response comes back with `finish_reason: "tool_calls"` and the call(s) under `message.tool_calls` — you run the tool and send the result back as a `tool` message. This is what lets agent frameworks drive their own tools on Compute Network.

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
}]

messages = [{"role": "user", "content": "What's the weather in Paris?"}]
r1 = client.chat.completions.create(model="qwen3.8-27b-uncensored", messages=messages, tools=tools)

call = r1.choices[0].message.tool_calls[0]            # get_weather({"city": "Paris"})
messages.append(r1.choices[0].message)
messages.append({"role": "tool", "tool_call_id": call.id, "content": "18C and sunny"})

r2 = client.chat.completions.create(model="qwen3.8-27b-uncensored", messages=messages, tools=tools)
print(r2.choices[0].message.content)                 # "The weather in Paris is 18°C and sunny."
```

Tool calling and vision are most reliable on `qwen3.8-27b-uncensored`. The Pro 8B can attempt tools but is less consistent.

## Vision

`qwen3.8-27b-uncensored` accepts images. Use OpenAI's multimodal content format with an inline base64 `data:` URL:

```python
import base64
img = base64.b64encode(open("photo.png", "rb").read()).decode()

resp = client.chat.completions.create(
    model="qwen3.8-27b-uncensored",
    messages=[{"role": "user", "content": [
        {"type": "text", "text": "What's in this image?"},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}},
    ]}],
)
print(resp.choices[0].message.content)
```

Pass images inline as base64; remote `https` image URLs aren't fetched in this version. Vision requires `qwen3.8-27b-uncensored`. Image *input* only — to create images, use the [image generation](#image-generation) endpoint.

## Building agents

Compute Network is designed to be the **brain** for agent frameworks. Your framework keeps doing what it does — memory, system prompt / persona, the tool loop — and Compute Network is the model it calls. Memory and persona need zero special handling: they're just the messages array and a system message you already send. Tools work through the standard function-calling flow above (the model returns `tool_calls`, your framework runs them and sends results back).

For agents, use **`qwen3.8-27b-uncensored`** (or `qwen3.8-27b-uncensored-think` for harder reasoning) — the 27B is far more reliable at multi-step tool use than the 8B.

### Any OpenAI-compatible framework

The universal setup: point the framework's model provider at Compute Network.

```
base_url / baseURL :  https://c0mpute.ai/api/v1
api_key            :  sk-c0mpute-...
model              :  qwen3.8-27b-uncensored
```

**OpenAI Agents SDK (Python)**

```python
from agents import Agent, Runner, OpenAIChatCompletionsModel
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="https://c0mpute.ai/api/v1", api_key="sk-c0mpute-...")
agent = Agent(name="Assistant", instructions="You are helpful.",
              model=OpenAIChatCompletionsModel(model="qwen3.8-27b-uncensored", openai_client=client))
print((await Runner.run(agent, "Plan my week.")).final_output)
```

**LangChain / LangGraph (Python)**

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="qwen3.8-27b-uncensored", base_url="https://c0mpute.ai/api/v1", api_key="sk-c0mpute-...")
```

**Vercel AI SDK (TypeScript)**

```ts
import { createOpenAI } from "@ai-sdk/openai";
const c0mpute = createOpenAI({ baseURL: "https://c0mpute.ai/api/v1", apiKey: "sk-c0mpute-..." });
// use c0mpute("qwen3.8-27b-uncensored") as the model in generateText / streamText / tool loops
```

### Hermes

Compute Network is a custom OpenAI-compatible endpoint. For Hermes, use **`qwen3.8-27b-uncensored-think`** (the 27B with extended reasoning). Add it as a **custom provider** in `~/.hermes/config.yaml`, with the API key set **on the provider** (Hermes does not read `~/.hermes/.env` at runtime, so the key must live in the config or an exported env var):

```yaml
custom_providers:
  - name: c0mpute
    base_url: https://c0mpute.ai/api/v1
    api_key: sk-c0mpute-...      # your key, inline
    models:
      qwen3.8-27b-uncensored-think: {}
```

Prefer not to hardcode the key? Use `key_env` and **export** that variable in your shell (Hermes reads it from the process environment, not from `.env`):

```yaml
custom_providers:
  - name: c0mpute
    base_url: https://c0mpute.ai/api/v1
    key_env: OPENAI_API_KEY      # must be exported, e.g. in ~/.bashrc
    models:
      qwen3.8-27b-uncensored-think: {}
```

Then select it with `hermes model` (or `/model` in-session) and run, e.g. `hermes -z "hello" -m qwen3.8-27b-uncensored-think`.

> If you see `HTTP 401: Invalid API key`, Hermes is sending its `no-key-required` placeholder — it didn't find your key. Set `api_key` on the provider as above (putting the key only in `~/.hermes/.env` does **not** work).

## Errors

Errors are returned in OpenAI's shape (`{ "error": { "message", "type", "code" } }`):

| Status | Meaning |
| --- | --- |
| `401` | Missing or invalid API key |
| `402` | Insufficient credits — top up with USDC |
| `404` | Unknown model |
| `429` | Rate limit exceeded |
| `503` | No worker available for the requested model (the 27B needs a native worker online) |

## Rate limits

Default **60 requests/minute per key**. Need more? Reach out.

## Image generation

`POST /api/images/generate` — generate an image and get it back inline as a base64 data URL. This is a Compute Network endpoint, separate from the OpenAI-compatible `/v1` surface. Auth uses the same `sk-c0mpute-…` bearer key (or a logged-in session).

### Request

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `prompt` | string | — | Required. |
| `negative_prompt` | string | — | Optional. A baseline anti-artifact negative is always applied on top. |
| `width` / `height` | int | 1024 | 512–1536, snapped to multiples of 64. |
| `steps` | int | 32 | 10–60. |
| `cfg` | number | 4.0 | Guidance scale; Chroma likes ~3.5–4.5. |
| `seed` | int | random | Optional, for reproducible output. |
| `nsfw` | bool | false | Allow adult content (18+). With it off, adult output is blocked. |

### Response

```json
{
  "image": "data:image/png;base64,...",
  "model": "c0mpute-image",
  "seed": 31337,
  "width": 1024,
  "height": 1024,
  "credits_charged": 10
}
```

The image is returned inline and **never stored** server-side. **10 credits ($0.01)** per image, refunded automatically on failure.

### Errors

- `400` — prompt blocked by the content policy, or a SFW request produced adult output.
- `402` — insufficient credits.
- `503` — no image workers are online right now (try again shortly).

### curl

```bash
curl https://c0mpute.ai/api/images/generate \
  -H "Authorization: Bearer $C0MPUTE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"a candid photo of a fox in snow, 35mm film","width":1216,"height":832}'
```

---
sidebar_position: 6
title: API
---

# Inference API

c0mpute exposes an **OpenAI-compatible** HTTP API — built for **agents**. It speaks chat completions, streaming, tool/function calling, and model discovery, so any agent framework that talks to OpenAI works by changing two things: the `base_url` and the `api_key`. Nothing else changes.

```
base_url:  https://c0mpute.ai/api/v1
```

Why run your agent on c0mpute: **uncensored** models (no refusals), **decentralized** compute, large context, and your prompts are **never stored** (processed in memory and discarded — only token counts are kept for billing) and **anonymous to the worker** (the GPU running your job gets the prompt text only, never your identity). See [Building agents](#building-agents) for framework setups.

## Authentication

Generate an API key at **[c0mpute.ai/settings](https://c0mpute.ai/settings)** → the **API** tab. Keys look like `sk-c0mpute-…` and are shown once on creation. Pass it as a bearer token:

```
Authorization: Bearer sk-c0mpute-...
```

Requests are billed to the credit balance of the account that owns the key. Top up with USDC from the dashboard.

## Models

| Model | Description |
| --- | --- |
| `c0mpute-pro` | Uncensored 8B. Fast, runs on the broad worker pool. |
| `c0mpute-max` | Uncensored 27B with tools, vision, and large context. |
| `c0mpute-max-think` | `c0mpute-max` with extended chain-of-thought reasoning. |

`GET /v1/models` lists them with a live `available` flag (Max requires a native GPU worker to be online). Always check availability if you depend on Max.

## Pricing

Billing is **flat per request** — you know the exact cost before you send it, no token math:

| Model | Credits / request | USD / request |
| --- | --- | --- |
| `c0mpute-pro` | 10 | $0.10 |
| `c0mpute-max` | 15 | $0.15 |
| `c0mpute-max-think` | 20 | $0.20 |

1 credit = $0.01. Buy credits with USDC from the [dashboard](https://c0mpute.ai/settings). A request that returns a tool call (one step of an agent loop) is one request. Rate limit: 60 requests/minute per key.

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

Pass your own `tools`. When the model decides to call one, the response comes back with `finish_reason: "tool_calls"` and the call(s) under `message.tool_calls` — you run the tool and send the result back as a `tool` message. This is what lets agent frameworks drive their own tools on c0mpute.

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
r1 = client.chat.completions.create(model="c0mpute-max", messages=messages, tools=tools)

call = r1.choices[0].message.tool_calls[0]            # get_weather({"city": "Paris"})
messages.append(r1.choices[0].message)
messages.append({"role": "tool", "tool_call_id": call.id, "content": "18C and sunny"})

r2 = client.chat.completions.create(model="c0mpute-max", messages=messages, tools=tools)
print(r2.choices[0].message.content)                 # "The weather in Paris is 18°C and sunny."
```

Tool calling and vision are most reliable on `c0mpute-max`. The Pro 8B can attempt tools but is less consistent.

## Vision

`c0mpute-max` accepts images. Use OpenAI's multimodal content format with an inline base64 `data:` URL:

```python
import base64
img = base64.b64encode(open("photo.png", "rb").read()).decode()

resp = client.chat.completions.create(
    model="c0mpute-max",
    messages=[{"role": "user", "content": [
        {"type": "text", "text": "What's in this image?"},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}},
    ]}],
)
print(resp.choices[0].message.content)
```

Pass images inline as base64; remote `https` image URLs aren't fetched in this version. Vision requires `c0mpute-max`.

## Building agents

c0mpute is designed to be the **brain** for agent frameworks. Your framework keeps doing what it does — memory, system prompt / persona, the tool loop — and c0mpute is the model it calls. Memory and persona need zero special handling: they're just the messages array and a system message you already send. Tools work through the standard function-calling flow above (the model returns `tool_calls`, your framework runs them and sends results back).

For agents, use **`c0mpute-max`** (or `c0mpute-max-think` for harder reasoning) — the 27B is far more reliable at multi-step tool use than the 8B.

### Any OpenAI-compatible framework

The universal setup: point the framework's model provider at c0mpute.

```
base_url / baseURL :  https://c0mpute.ai/api/v1
api_key            :  sk-c0mpute-...
model              :  c0mpute-max
```

**OpenAI Agents SDK (Python)**

```python
from agents import Agent, Runner, OpenAIChatCompletionsModel
from openai import AsyncOpenAI

client = AsyncOpenAI(base_url="https://c0mpute.ai/api/v1", api_key="sk-c0mpute-...")
agent = Agent(name="Assistant", instructions="You are helpful.",
              model=OpenAIChatCompletionsModel(model="c0mpute-max", openai_client=client))
print((await Runner.run(agent, "Plan my week.")).final_output)
```

**LangChain / LangGraph (Python)**

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="c0mpute-max", base_url="https://c0mpute.ai/api/v1", api_key="sk-c0mpute-...")
```

**Vercel AI SDK (TypeScript)**

```ts
import { createOpenAI } from "@ai-sdk/openai";
const c0mpute = createOpenAI({ baseURL: "https://c0mpute.ai/api/v1", apiKey: "sk-c0mpute-..." });
// use c0mpute("c0mpute-max") as the model in generateText / streamText / tool loops
```

### Hermes

c0mpute is a custom OpenAI-compatible endpoint. For Hermes, use **`c0mpute-max-think`** (Max with extended reasoning). Add it as a **custom provider** in `~/.hermes/config.yaml`, with the API key set **on the provider** (Hermes does not read `~/.hermes/.env` at runtime, so the key must live in the config or an exported env var):

```yaml
custom_providers:
  - name: c0mpute
    base_url: https://c0mpute.ai/api/v1
    api_key: sk-c0mpute-...      # your key, inline
    models:
      c0mpute-max-think: {}
```

Prefer not to hardcode the key? Use `key_env` and **export** that variable in your shell (Hermes reads it from the process environment, not from `.env`):

```yaml
custom_providers:
  - name: c0mpute
    base_url: https://c0mpute.ai/api/v1
    key_env: OPENAI_API_KEY      # must be exported, e.g. in ~/.bashrc
    models:
      c0mpute-max-think: {}
```

Then select it with `hermes model` (or `/model` in-session) and run, e.g. `hermes -z "hello" -m c0mpute-max-think`.

> If you see `HTTP 401: Invalid API key`, Hermes is sending its `no-key-required` placeholder — it didn't find your key. Set `api_key` on the provider as above (putting the key only in `~/.hermes/.env` does **not** work).

## Errors

Errors are returned in OpenAI's shape (`{ "error": { "message", "type", "code" } }`):

| Status | Meaning |
| --- | --- |
| `401` | Missing or invalid API key |
| `402` | Insufficient credits — top up with USDC |
| `404` | Unknown model |
| `429` | Rate limit exceeded |
| `503` | No worker available for the requested tier (Max needs a native worker online) |

## Rate limits

Default **60 requests/minute per key**. Need more? Reach out.

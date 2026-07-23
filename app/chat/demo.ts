// PREVIEW-ONLY demo driver: with the network offline, chat streams scripted
// responses through the exact production pipeline (token handler, throttled
// flush, think-tag timing, sources, generated images) so the UI can be judged
// end to end. Deleted at flip time along with the preview flag.
import type { SourceRef } from './lib';
import type { NetworkStats } from '@/lib/orchestrator/types';

export const DEMO_MODE = process.env.NEXT_PUBLIC_PREVIEW_MODE === '1';

// Fake-but-plausible stats so network-flavored UI is visible in the preview.
// Demo-only fixture behind basic auth; never ships.
export const DEMO_NETWORK_STATS: NetworkStats = {
  workersOnline: 7,
  browserWorkers: 4,
  nativeWorkers: 3,
  nativeByModel: { 'qwen3.5-27b-abliterated': 2, 'supergemma4-26b': 1 },
  jobsInQueue: 1,
  jobsCompleted: 12843,
  tokensGenerated: 9481022,
  avgJobDurationMs: 6400,
};

export interface DemoScript {
  body: string;
  sources?: SourceRef[];
  image?: boolean;
}

const TOUR = `## This is the demo network

The preview streams this reply through the real chat pipeline, so everything you see renders exactly as production would.

Here is what the renderer handles:

- **Bold**, *italic*, and \`inline code\`
- Links, like the [network map](https://shard.c0mpute.ai)
- Ordered structure and tables

| Tier | Model | Cost |
|------|-------|------|
| Free | Llama 3.2 3B | 0 cr |
| Pro | Qwen3 8B | 10 cr |
| Max | Qwen3.5 27B | 15 cr |

> Blockquotes render like this, for quoted context.

\`\`\`python
def settle(receipts):
    verified = [r for r in receipts if r.check()]
    return pay(verified, split="by_layers")
\`\`\`

Type **math**, **code**, **thinking**, **sources**, or **image** to test each feature on its own.`;

const MATH = `The attention weights are a softmax over scaled dot products:

$$\\mathrm{Attention}(Q, K, V) = \\mathrm{softmax}\\!\\left(\\frac{QK^\\top}{\\sqrt{d_k}}\\right)V$$

Per head, the cost is $O(n^2 d)$ for sequence length $n$ and head dimension $d$. With $h$ heads the totals stack linearly, while the KV cache grows as $O(n \\cdot h \\cdot d)$ per layer.

For a 62-layer model split across a ring, each stage holds its slice of that cache, which is why a 24 GB card can hold layers it could never train.`;

const CODE = `Here is a minimal client against the OpenAI-compatible endpoint:

\`\`\`python
import openai

client = openai.OpenAI(
    base_url="https://c0mpute.ai/api/v1",
    api_key="sk-c0mpute-...",
)

stream = client.chat.completions.create(
    model="c0mpute-swarm",
    messages=[{"role": "user", "content": "Explain speculative decoding"}],
    stream=True,
)

for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="")
\`\`\`

Key parameters:

| Parameter | Value | Note |
|-----------|-------|------|
| \`model\` | \`c0mpute-swarm\` | routed to the ring |
| \`stream\` | \`true\` | tokens as they commit |
| \`max_tokens\` | up to 4096 | per response |`;

const THINKING = `<think>
The user wants to see the thinking display. A good demonstration needs a question with actual reasoning steps, so: estimating how many 24 GB cards hold a 229B model.

Weights at NVFP4 are roughly 115 GB for the experts plus attention in bf16. A 24 GB card keeps about 20 GB for weights after activations and cache. 115 / 20 is just under 6, so six cards minimum, and a real ring wants a spare for churn.

That is the answer: six slices, seven boxes for comfort.
</think>A 229B model at 4-bit precision weighs roughly 115 GB. A 24 GB consumer card can dedicate about 20 GB to weights once activations and the KV cache take their share, so the model splits into six slices of around 19 GB each.

Six cards hold one full copy. A practical ring runs seven, keeping one warm spare so a node leaving mid-serve is a re-route instead of an outage.`;

const SOURCES_BODY = `Speculative decoding lets a small drafter propose tokens that the large model verifies in one batched pass [1]. Verification is lossless: any token the target model disagrees with is rejected and regenerated, so output quality is exactly the target model's [2].

Over a wide-area ring this matters double, because each verified batch amortizes a full network round trip [3]. The acceptance rate, not raw bandwidth, sets the ceiling.`;

const SOURCES: SourceRef[] = [
  { title: 'Fast Inference from Transformers via Speculative Decoding', url: 'https://arxiv.org/abs/2211.17192', description: 'Leviathan et al., the original speculative decoding paper.' },
  { title: 'Accelerating LLM Inference with Staged Speculative Decoding', url: 'https://arxiv.org/abs/2308.04623', description: 'Staged drafting and verification trade-offs.' },
  { title: 'shard: the engine', url: 'https://github.com/leyten/shard', description: 'The pipeline runtime this network serves with.' },
];

const IMAGE_BODY = `Rendering a demo image now. The skeleton below is the real generating state, and the picture attaches through the same async path a worker uses.`;

export function pickDemo(prompt: string): DemoScript {
  const p = prompt.toLowerCase();
  if (/math|equation|integral|attention|formula/.test(p)) return { body: MATH };
  if (/code|python|script|api|endpoint/.test(p)) return { body: CODE };
  if (/think|reason/.test(p)) return { body: THINKING };
  if (/source|search|cite|link/.test(p)) return { body: SOURCES_BODY, sources: SOURCES };
  if (/image|picture|draw|render/.test(p)) return { body: IMAGE_BODY, image: true };
  return { body: TOUR };
}

// Split into small chunks so streaming looks and behaves like the real feed.
export function demoChunks(s: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    const n = 2 + Math.floor(((i * 2654435761) % 5));
    out.push(s.slice(i, i + n));
    i += n;
  }
  return out;
}

export const demoSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// A generated-image stand-in drawn in the site's own art language.
export function makeDemoImage(): string {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c0a09';
  g.fillRect(0, 0, c.width, c.height);
  const cx = c.width / 2, cy = c.height / 2, R = 180;
  for (let a = 0; a < Math.PI * 2; a += 0.05) {
    for (let r = 0.25; r <= 1; r += 0.08) {
      const x = cx + Math.cos(a) * R * r, y = cy + Math.sin(a) * R * r * 0.72;
      const keep = Math.abs(Math.sin(a * 5.3 + r * 17)) > 0.42;
      if (keep) {
        g.fillStyle = `rgba(255,255,255,${(0.18 + 0.4 * Math.abs(Math.sin(a * 3 + r * 9))).toFixed(2)})`;
        g.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
    }
  }
  g.strokeStyle = 'rgba(52,211,153,0.8)';
  g.lineWidth = 1;
  g.beginPath();
  const ring = [-0.9, -0.3, 0.4, 1.1, 1.9, 2.8];
  ring.forEach((a, i) => {
    const x = cx + Math.cos(a) * R * 0.55, y = cy + Math.sin(a) * R * 0.4;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  });
  g.closePath();
  g.stroke();
  ring.forEach((a) => {
    const x = cx + Math.cos(a) * R * 0.55, y = cy + Math.sin(a) * R * 0.4;
    g.fillStyle = 'rgba(52,211,153,1)';
    g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  });
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.font = '12px monospace';
  g.textAlign = 'center';
  g.fillText('demo render', cx, c.height - 22);
  return c.toDataURL('image/png');
}

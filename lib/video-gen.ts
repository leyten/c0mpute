// Text-to-video (Studio): pricing, caller auth and the ComfyUI graph builder.
//
// The graph is DEPLOYMENT CONFIG, not code. Which diffusion model and LoRAs a
// clip renders with is decided by untracked manifests on the server, so
// swapping models is an edit to a file, with no code change. There are two,
// and a request only ever uses its own: VIDEO_WORKFLOW_PATH is the SFW graph,
// VIDEO_WORKFLOW_PATH_ADULT the 18+ one (an adult LoRA must never load for an
// SFW request). Unset or unreadable, that side of Studio reports itself
// unavailable and nothing is charged. deploy/video-workflow.example.json shows
// the format with the stock Wan 2.2 T2V files.
//
// Manifest: { workflow: <graph> | "<graph file next to the manifest>",
//   params: { <name>: { paths: [[nodeId, inputName], ...], default? } },
//   sizes: [[w, h], ...], output_node: "<SaveVideo node id>" }
// The params filled here are prompt, negative, width, height, frames and seed.
// The negative is always the manifest's: a user negative bypasses the prompt
// guard, and in 18+ mode it could push apparent age down.

import { NextRequest } from 'next/server';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { randomInt } from 'crypto';
import { verifyPrivyToken } from './privy-server';
import { resolveApiKeyFull } from './db';

// One clip, everywhere video is charged: 25 images' worth (IMAGE_CREDITS
// defaults to 10). A 5s 720p clip holds a 24GB GPU for ~4-5 minutes against
// ~30s for an image.
export const VIDEO_CREDITS = Number(process.env.VIDEO_CREDITS || 250);

// Same auth as the image route: a Privy access token (the /studio page) or a
// c0mpute API key, with the key's free_only scope carried through.
export async function resolveVideoCaller(req: NextRequest): Promise<{ privyId: string; freeOnly: boolean; isApiKey: boolean } | null> {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  if (token.startsWith('sk-c0mpute-')) {
    const key = resolveApiKeyFull(token);
    return key ? { privyId: key.privyId, freeOnly: key.freeOnly, isApiKey: true } : null;
  }
  const privyId = await verifyPrivyToken(token);
  return privyId ? { privyId, freeOnly: false, isApiKey: false } : null;
}

type Graph = Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;

interface VideoManifest {
  workflow: Graph | string;
  params: Record<string, { paths?: [string, string][]; default?: unknown }>;
  sizes?: [number, number][];
  output_node?: string;
}

export interface BuiltVideoWorkflow {
  workflow: Record<string, unknown>;
  outputNode?: string;
  seed: number;
  width: number;
  height: number;
  frames: number;
}

// Read per call: the file is a few KB, and an edit applies from the next clip.
function loadManifest(adult: boolean): { manifest: VideoManifest; graph: Graph } | null {
  const path = adult ? process.env.VIDEO_WORKFLOW_PATH_ADULT : process.env.VIDEO_WORKFLOW_PATH;
  if (!path) return null;
  try {
    const manifest = JSON.parse(readFileSync(path, 'utf8')) as VideoManifest;
    const graph: Graph = typeof manifest.workflow === 'string'
      ? JSON.parse(readFileSync(resolve(dirname(path), manifest.workflow), 'utf8'))
      : manifest.workflow;
    if (!graph || typeof graph !== 'object' || !manifest.params?.prompt?.paths?.length) {
      console.error(`[video-gen] ${path} has no graph or no prompt param`);
      return null;
    }
    return { manifest, graph };
  } catch (err) {
    console.error(`[video-gen] could not load ${path}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** The graph for one clip from the SFW or the 18+ manifest, or null when that
 *  side of Studio is not configured. */
export function buildVideoWorkflow(p: { prompt: string; adult: boolean; width?: number; height?: number; seed?: number }): BuiltVideoWorkflow | null {
  const loaded = loadManifest(p.adult);
  if (!loaded) return null;
  const { manifest, graph } = loaded;
  const workflow = structuredClone(graph);

  // Only the sizes the manifest lists: any other size is a different cost per
  // clip, and Wan wants multiples of 16.
  const sizes = manifest.sizes?.length
    ? manifest.sizes
    : [[Number(manifest.params.width?.default) || 1280, Number(manifest.params.height?.default) || 720] as [number, number]];
  const [width, height] = sizes.find(([w, h]) => w === Number(p.width) && h === Number(p.height)) ?? sizes[0];
  // Fixed per deployment, not per request: the price is per clip.
  const frames = Number(manifest.params.frames?.default) || 81;
  const seed = Number.isSafeInteger(Number(p.seed)) && Number(p.seed) > 0 ? Number(p.seed) : randomInt(1, 2 ** 31);
  const negative = manifest.params.negative?.default ?? '';

  const values: Record<string, unknown> = { prompt: p.prompt, negative, width, height, frames, seed };
  for (const [name, value] of Object.entries(values)) {
    for (const [node, input] of manifest.params[name]?.paths ?? []) {
      // A path to a node the graph lacks would silently render the template's
      // own text or size, so it is a config error, not something to skip.
      const inputs = workflow[node]?.inputs;
      if (!inputs) {
        console.error(`[video-gen] manifest param "${name}" points at missing node ${node}`);
        return null;
      }
      inputs[input] = value;
    }
  }
  return { workflow, outputNode: manifest.output_node, seed, width, height, frames };
}

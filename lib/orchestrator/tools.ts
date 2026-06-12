/**
 * Tool definitions and execution for the c0mpute orchestrator.
 * Tools are defined here and sent to workers that support tool calling.
 * The orchestrator executes tools when the model requests them.
 */

import { ToolDefinition, ToolCall, ChatMessage } from './types';

// Dynamic imports for server-only modules
type SearchHit = { title: string; url: string; description: string; age?: string };
let braveSearch: (query: string, freshness?: string) => Promise<SearchHit[]> = async () => [];
let enrichResults: (results: SearchHit[], topN?: number, maxChars?: number) => Promise<SearchHit[]> = async (r) => r;

try {
  const searchServer = require('../search-server');
  braveSearch = searchServer.braveSearch;
  enrichResults = searchServer.enrichResults;
} catch (e) {
  console.warn('[Tools] Search modules not available:', (e as Error).message);
}

/**
 * Tool definitions sent to the worker/model.
 * The model sees these and decides when to call them.
 */
/**
 * Context passed by the orchestrator so tools can act on behalf of the job's
 * user (billing) and reach the image worker pool (in-process render).
 */
export type ToolContext = {
  privyUserId?: string;
  renderImage?: (
    workflow: Record<string, unknown>,
    meta: { privyUserId: string; seed?: number; width?: number; height?: number; creditsCharged: number },
  ) => Promise<string>;
};

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image from a text prompt on the c0mpute GPU network. Use when the user asks for a picture, photo, drawing, artwork, logo, wallpaper or any other visual. Write a rich visual prompt: subject, setting, style, lighting, composition. The image is shown to the user automatically. Costs the user 20 credits per image, so call it once per request unless they ask for variations.',
      parameters: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed visual description of the image to generate. Describe the subject, environment, art style, lighting and mood in one flowing prompt.',
          },
          negative_prompt: {
            type: 'string',
            description: 'Optional: things to avoid in the image (e.g. "blurry, text, watermark").',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for current information. Use this when you need up-to-date data like news, prices, weather, scores, recent events, or anything that may have changed after your training data.',
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: {
            type: 'string',
            description: 'The search query. Be specific and concise. For recent events, build the query around the current date rather than your training data.',
          },
          freshness: {
            type: 'string',
            enum: ['day', 'week', 'month', 'year', 'all'],
            description: 'How recent results must be. Use "day" or "week" for breaking news or things just announced, "month" for recent topics, "year" for the past year, "all" (default) for general questions.',
          },
        },
      },
    },
  },
];

/**
 * Execute a tool call and return the result as a ChatMessage.
 */
export async function executeTool(toolCall: ToolCall, ctx?: ToolContext): Promise<{ message: ChatMessage; sources?: { title: string; url: string; description: string }[]; images?: string[] }> {
  const { name, arguments: args } = toolCall.function;

  switch (name) {
    case 'generate_image': {
      const prompt = ((args.prompt as string) || '').trim();
      const fail = (content: string) => ({ message: { role: 'tool' as const, content, tool_name: name } });
      if (!prompt) return fail('Error: no image prompt provided.');
      if (!ctx?.renderImage || !ctx.privyUserId) return fail('Image generation is not available right now.');

      // Same safety floor as /create. Chat is the uncensored surface, so the
      // NSFW gate is open — only the absolute line is enforced.
      const { checkImagePromptSafety } = require('../image-safety');
      const safety = checkImagePromptSafety(prompt, { nsfwAllowed: true });
      if (!safety.allowed) return fail(`Image request blocked by safety policy: ${safety.reason}. Tell the user briefly and do not retry.`);

      const { buildImageWorkflow, IMAGE_CREDITS } = require('../image-gen');
      const { spendCredits, refundCredits } = require('../db');
      const { consumeStakerAllowance, refundStakerAllowance } = require('../staker-allowance');
      const { STAKER_ALLOWANCE_ENABLED } = require('../tokenomics');

      // Pay order mirrors /create minus the onboarding free images: staker
      // allowance first, then paid credits.
      let usedAllowance = false;
      if (STAKER_ALLOWANCE_ENABLED && consumeStakerAllowance(ctx.privyUserId, IMAGE_CREDITS)) {
        usedAllowance = true;
      } else if (!spendCredits(ctx.privyUserId, IMAGE_CREDITS, 'Image generation (chat)')) {
        return fail(`The user does not have enough credits — image generation costs ${IMAGE_CREDITS} credits. Tell them to top up in Settings.`);
      }

      console.log(`[Tools] generate_image for ${ctx.privyUserId}: "${prompt.slice(0, 80)}"`);
      try {
        const { workflow, seed, width, height } = buildImageWorkflow({
          prompt,
          negativePrompt: typeof args.negative_prompt === 'string' ? args.negative_prompt : undefined,
        });
        const image = await ctx.renderImage(workflow, { privyUserId: ctx.privyUserId, seed, width, height, creditsCharged: IMAGE_CREDITS });
        return {
          message: {
            role: 'tool',
            content: 'Image generated successfully and already shown to the user inline. Briefly describe what you created in one or two sentences — do not output the image data or a link.',
            tool_name: name,
          },
          images: [image],
        };
      } catch (err) {
        if (usedAllowance) refundStakerAllowance(ctx.privyUserId, IMAGE_CREDITS);
        else refundCredits(ctx.privyUserId, IMAGE_CREDITS, 'Image generation failed (chat)');
        console.error('[Tools] generate_image failed:', err instanceof Error ? err.message : err);
        return fail(`Image generation failed: ${err instanceof Error ? err.message : 'unknown error'}. The user was refunded. Tell them briefly.`);
      }
    }

    case 'web_search': {
      const query = (args.query as string) || '';
      const freshness = (args.freshness as string) || undefined;
      if (!query) {
        return {
          message: {
            role: 'tool',
            content: 'Error: No search query provided.',
            tool_name: name,
          },
        };
      }

      console.log(`[Tools] web_search: "${query}"${freshness ? ` (freshness=${freshness})` : ''}`);

      try {
        const rawResults = await braveSearch(query, freshness);
        if (rawResults.length === 0) {
          return {
            message: {
              role: 'tool',
              content: 'No search results found.',
              tool_name: name,
            },
          };
        }

        // Enrich top 3 results with trimmed page content to keep the
        // model's context budget free for reasoning + answer
        const results = await enrichResults(rawResults, 3, 1200);

        // Feed only the top 5 to the model (3 enriched + 2 snippets);
        // the rest are still sent to the frontend for display
        let content = '';
        results.slice(0, 5).forEach((r, i) => {
          content += `[${i + 1}] ${r.title}\n${r.age ? `Published: ${r.age}\n` : ''}URL: ${r.url}\n${r.description}\n\n`;
        });

        return {
          message: {
            role: 'tool',
            content: content.trim(),
            tool_name: name,
          },
          sources: rawResults.slice(0, 8), // send raw results for frontend display
        };
      } catch (err) {
        console.error('[Tools] web_search failed:', err);
        return {
          message: {
            role: 'tool',
            content: 'Search failed. Please try again.',
            tool_name: name,
          },
        };
      }
    }

    default:
      return {
        message: {
          role: 'tool',
          content: `Unknown tool: ${name}`,
          tool_name: name,
        },
      };
  }
}

/**
 * Execute multiple tool calls in parallel.
 */
export async function executeToolCalls(toolCalls: ToolCall[], ctx?: ToolContext): Promise<{
  messages: ChatMessage[];
  sources?: { title: string; url: string; description: string }[];
  images?: string[];
}> {
  const results = await Promise.all(toolCalls.map(tc => executeTool(tc, ctx)));

  const messages = results.map(r => r.message);
  // Collect sources from all tool calls (mainly web_search)
  const allSources = results
    .filter(r => r.sources)
    .flatMap(r => r.sources!);
  // Collect generated images (base64 PNGs, relayed straight to the client)
  const allImages = results
    .filter(r => r.images)
    .flatMap(r => r.images!);

  return {
    messages,
    sources: allSources.length > 0 ? allSources : undefined,
    images: allImages.length > 0 ? allImages : undefined,
  };
}

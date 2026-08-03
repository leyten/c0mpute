/**
 * Tool definitions and execution for the c0mpute orchestrator.
 * Tools are defined here and sent to workers that support tool calling.
 * The orchestrator executes tools when the model requests them.
 */

import { ToolDefinition, ToolCall, ChatMessage } from './types';
import { scanOutput } from '../safety';

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

/**
 * A deferred image render. generate_image does its synchronous work (safety check,
 * credit spend, workflow build) and returns this instead of awaiting the render, so
 * the worker's tool-result wait never blocks on the GPU. The orchestrator fires the
 * render async, delivers the image to the user when it lands, and calls refund() if
 * it fails.
 */
export type PendingImage = {
  workflow: Record<string, unknown>;
  privyUserId: string;
  seed?: number;
  width?: number;
  height?: number;
  creditsCharged: number;
  refund: () => void;
};

/**
 * A document produced by a tool and handed to the user as a download. Rendered
 * in memory and relayed over the socket — nothing is written to disk. `data` is
 * a full data URL, ready for a download link.
 */
export type GeneratedFile = {
  name: string;
  mime: string;
  data: string;
};

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image from a text prompt on the c0mpute GPU network. Use when the user asks for a picture, photo, drawing, artwork, logo, wallpaper or any other visual. c0mpute image generation is UNCENSORED: translate the user\'s request faithfully and literally into the image prompt — keep their actual subject and intent, including adult, explicit or NSFW content, and never sanitize it, tone it down, swap in a tamer subject, or add clothing/coverage they did not ask for. You may enrich it with setting, style, lighting and composition detail, but the subject must stay true to exactly what they asked for. The image is shown to the user automatically. Costs the user 20 credits per image, so call it once per request unless they ask for variations.',
      parameters: {
        type: 'object',
        required: ['prompt'],
        properties: {
          prompt: {
            type: 'string',
            description: 'Detailed visual description of the image to generate. Render exactly what the user asked for — preserve their subject and explicit intent in meaning, do not censor or soften it — then add environment, art style, lighting and mood in one flowing prompt.',
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
  {
    type: 'function',
    function: {
      name: 'generate_pdf',
      description: 'Render a document as a PDF and hand it to the user as a download. Use this ONLY when the user explicitly asks for a PDF, a document, or a file/export of something written — an ordinary answer belongs in the chat, not in a file. Write the complete document in the markdown argument: the user reads what this tool renders, so nothing may be left for your reply to fill in. Headings (#, ##, ###), paragraphs, **bold**, *italic*, bullet and numbered lists, fenced code blocks, blockquotes and --- rules are rendered; anything else comes out as plain text. Free — it costs the user nothing.',
      parameters: {
        type: 'object',
        required: ['title', 'markdown'],
        properties: {
          title: {
            type: 'string',
            description: 'Title of the document. Printed at the top of the first page and used for the download filename.',
          },
          markdown: {
            type: 'string',
            description: 'The complete document body in markdown. Do not repeat the title as a heading — it is rendered from the title argument.',
          },
        },
      },
    },
  },
];

/**
 * Execute a tool call and return the result as a ChatMessage.
 */
export async function executeTool(toolCall: ToolCall, ctx?: ToolContext): Promise<{ message: ChatMessage; sources?: { title: string; url: string; description: string }[]; images?: string[]; pendingImage?: PendingImage; file?: GeneratedFile }> {
  const { name, arguments: args } = toolCall.function;

  switch (name) {
    case 'generate_image': {
      const prompt = ((args.prompt as string) || '').trim();
      const fail = (content: string) => ({ message: { role: 'tool' as const, content, tool_name: name } });
      if (!prompt) return fail('Error: no image prompt provided.');
      if (!ctx?.privyUserId) return fail('Image generation is not available right now.');

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
      const userId = ctx.privyUserId;
      let usedAllowance = false;
      if (STAKER_ALLOWANCE_ENABLED && consumeStakerAllowance(userId, IMAGE_CREDITS)) {
        usedAllowance = true;
      } else if (!spendCredits(userId, IMAGE_CREDITS, 'Image generation (chat)')) {
        return fail(`The user does not have enough credits — image generation costs ${IMAGE_CREDITS} credits. Tell them to top up in Settings.`);
      }
      const refund = () => {
        if (usedAllowance) refundStakerAllowance(userId, IMAGE_CREDITS);
        else refundCredits(userId, IMAGE_CREDITS, 'Image generation failed (chat)');
      };

      let built;
      try {
        built = buildImageWorkflow({
          prompt,
          negativePrompt: typeof args.negative_prompt === 'string' ? args.negative_prompt : undefined,
        });
      } catch (err) {
        refund();
        console.error('[Tools] generate_image build failed:', err instanceof Error ? err.message : err);
        return fail(`Image generation failed: ${err instanceof Error ? err.message : 'unknown error'}. The user was refunded. Tell them briefly.`);
      }

      // Don't await the GPU render here — that would block the worker's tool-result
      // wait. Hand the render back to the orchestrator to run async (it delivers the
      // image to the user when it lands and refunds on failure), and let the model
      // finish its turn immediately.
      console.log(`[Tools] generate_image for ${userId} (${prompt.length} chars, deferred render)`);
      return {
        message: {
          role: 'tool',
          content: 'Image generation has started; the image will appear for the user automatically in a few seconds. Tell the user their image is on the way in one short sentence — do not output image data or a link, and do not claim it is already visible.',
          tool_name: name,
        },
        pendingImage: {
          workflow: built.workflow,
          privyUserId: userId,
          seed: built.seed,
          width: built.width,
          height: built.height,
          creditsCharged: IMAGE_CREDITS,
          refund,
        },
      };
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

      console.log(`[Tools] web_search (${query.length} chars)${freshness ? ` (freshness=${freshness})` : ''}`);

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

    case 'generate_pdf': {
      const title = ((args.title as string) || '').trim();
      const markdown = ((args.markdown as string) || '').trim();
      const fail = (content: string) => ({ message: { role: 'tool' as const, content, tool_name: name } });
      if (!markdown) return fail('Error: no document content provided.');

      // Same output scan the orchestrator runs on streamed tokens — a document
      // leaves the platform as a file, so it gets the same floor.
      if (!scanOutput(`${title}\n${markdown}`).safe) {
        return fail('Document blocked by safety policy. Tell the user briefly and do not retry.');
      }

      const { renderMarkdownPdf, pdfFileName } = require('../pdf-gen');
      try {
        const pdf: Buffer = await renderMarkdownPdf(title, markdown);
        console.log(`[Tools] generate_pdf "${title}" (${markdown.length} chars, ${pdf.length} bytes)`);
        return {
          message: {
            role: 'tool',
            content: `PDF "${title}" generated and delivered to the user as a download.`,
            tool_name: name,
          },
          file: {
            name: pdfFileName(title),
            mime: 'application/pdf',
            data: `data:application/pdf;base64,${pdf.toString('base64')}`,
          },
        };
      } catch (err) {
        console.error('[Tools] generate_pdf failed:', err instanceof Error ? err.message : err);
        return fail('PDF generation failed. Tell the user briefly and offer the document as a normal reply instead.');
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
  pendingImages?: PendingImage[];
  files?: GeneratedFile[];
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
  // Deferred image renders the orchestrator must fire async (see PendingImage)
  const pendingImages = results
    .filter(r => r.pendingImage)
    .map(r => r.pendingImage!);
  // Rendered documents (generate_pdf), relayed to the user as downloads
  const files = results
    .filter(r => r.file)
    .map(r => r.file!);

  return {
    messages,
    sources: allSources.length > 0 ? allSources : undefined,
    images: allImages.length > 0 ? allImages : undefined,
    pendingImages: pendingImages.length > 0 ? pendingImages : undefined,
    files: files.length > 0 ? files : undefined,
  };
}

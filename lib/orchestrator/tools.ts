/**
 * Tool definitions and execution for the c0mpute orchestrator.
 * Tools are defined here and sent to workers that support tool calling.
 * The orchestrator executes tools when the model requests them.
 */

import { ToolDefinition, ToolCall, ChatMessage } from './types';

// Dynamic imports for server-only modules
let braveSearch: (query: string) => Promise<{ title: string; url: string; description: string }[]> = async () => [];
let enrichResults: (results: { title: string; url: string; description: string }[], topN?: number) => Promise<{ title: string; url: string; description: string }[]> = async (r) => r;

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
export const AVAILABLE_TOOLS: ToolDefinition[] = [
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
            description: 'The search query. Be specific and concise.',
          },
        },
      },
    },
  },
];

/**
 * Execute a tool call and return the result as a ChatMessage.
 */
export async function executeTool(toolCall: ToolCall): Promise<{ message: ChatMessage; sources?: { title: string; url: string; description: string }[] }> {
  const { name, arguments: args } = toolCall.function;

  switch (name) {
    case 'web_search': {
      const query = (args.query as string) || '';
      if (!query) {
        return {
          message: {
            role: 'tool',
            content: 'Error: No search query provided.',
            tool_name: name,
          },
        };
      }

      console.log(`[Tools] web_search: "${query}"`);

      try {
        const rawResults = await braveSearch(query);
        if (rawResults.length === 0) {
          return {
            message: {
              role: 'tool',
              content: 'No search results found.',
              tool_name: name,
            },
          };
        }

        // Enrich top 3 results with page content
        const results = await enrichResults(rawResults, 3);

        // Format results for the model
        let content = '';
        results.forEach((r, i) => {
          content += `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}\n\n`;
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
export async function executeToolCalls(toolCalls: ToolCall[]): Promise<{
  messages: ChatMessage[];
  sources?: { title: string; url: string; description: string }[];
}> {
  const results = await Promise.all(toolCalls.map(tc => executeTool(tc)));

  const messages = results.map(r => r.message);
  // Collect sources from all tool calls (mainly web_search)
  const allSources = results
    .filter(r => r.sources)
    .flatMap(r => r.sources!);

  return {
    messages,
    sources: allSources.length > 0 ? allSources : undefined,
  };
}

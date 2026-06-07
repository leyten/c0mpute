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
export async function executeTool(toolCall: ToolCall): Promise<{ message: ChatMessage; sources?: { title: string; url: string; description: string }[] }> {
  const { name, arguments: args } = toolCall.function;

  switch (name) {
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

/**
 * Client-side search utilities (isomorphic, no Node.js imports).
 * Used by the user page to detect when web search would help.
 */

/**
 * Detect whether a user message would benefit from web search.
 */
export function shouldSearch(message: string, previousMessages?: { role: string; content: string }[]): boolean {
  const lower = message.toLowerCase().trim();

  // Too short to need search
  if (lower.length < 15) return false;

  // Skip patterns — things the model can handle itself
  const skipPatterns = [
    /^(hi|hey|hello|sup|yo|thanks|thank you|ok|okay|sure|bye|good\s?(morning|night|evening))/,
    /^(write|create|compose|draft|generate|make)\s/i,
    /^(translate|convert|calculate|compute|solve|simplify|factor|derive|integrate)\b/i,
    /^(explain|teach|help|tell me (how|about|the difference))\s/i,
    /^(debug|fix|refactor|optimize|review|rewrite|improve)\s/i,
    /^(summarize|paraphrase|rephrase|shorten|expand)\s/i,
    /^(list|give me|name)\s+(some|a few|the|all)?\s*(examples?|ideas?|ways?|reasons?|steps?|tips?)/i,
    /```/, // Code blocks = coding task
    /^(roleplay|pretend|imagine|act as|you are)\b/i,
    // Self-referential
    /\b(who are you|what are you|what can you do|what('s| is) your (name|purpose)|tell me about yourself|are you (a |an )?(ai|bot|assistant|human|real))\b/i,
    // General knowledge the model already knows
    /\b(what is|what are|what does|how does|how do|how to|why do|why does|why is|can you explain)\b(?!.*(latest|recent|current|today|now|2024|2025|2026|price|worth|cost))/i,
    // Math, logic, definitions
    /\b(define|definition of|meaning of|what does .* mean)\b/i,
    /\b(if .* then|would you rather|pros and cons)\b/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(lower)) return false;
  }

  // Trigger patterns — things that genuinely need fresh data
  const triggerPatterns = [
    // Explicit time references that imply fresh data needed
    /\b(latest|recent|current|today|yesterday|this week|this month|right now)\b/i,
    /\b(20(2[4-9]|[3-9]\d))\b/, // Year references 2024+
    // Real-time data
    /\b(price|stock|market cap|trading at|worth)\s+(of|for)\b/i,
    /\b(weather|forecast|temperature)\s+(in|for|at)\b/i,
    /\b(score|results?|standings?|schedule)\s+(of|for|in)\b/i,
    // Explicit search intent
    /\b(search|look up|google|find out|check if)\b/i,
    // News and events
    /\b(news|update|announcement|released?|launched?)\s+(about|from|by|on|for)\b/i,
    /\b(what happened|did .* (announce|release|launch|win|lose|die|resign))\b/i,
    // Specific entity lookups that benefit from fresh data
    /\b(who (is|was) the (current|new)|who (won|leads?|runs?))\b/i,
  ];

  for (const pattern of triggerPatterns) {
    if (pattern.test(lower)) return true;
  }

  return false;
}

/**
 * Extract a concise search query from the user's message.
 * Uses conversation history to resolve vague references like "it", "that", "more detailed", etc.
 */
export function extractQuery(message: string, previousMessages?: { role: string; content: string }[]): string {
  let query = message.trim();
  
  // Strip conversational prefixes and search commands
  query = query.replace(/^(no,?\s+|yes,?\s+|ok,?\s+|please\s+|can you\s+|could you\s+|just\s+|actually\s+)/i, '');
  query = query.replace(/^(search|look up|find|google)\s+(the\s+)?(internet|web|online|it|that|this)?\s*(for\s+)?(it|that|this|me)?\s*/i, '');
  query = query.replace(/^(and\s+)?(give|show|tell|get)\s+(me\s+)?/i, '');
  
  // Check if the remaining query is vague / lacks a clear topic
  const hasPronouns = /\b(it|that|this|the same|above|previous)\b/i.test(query);
  const isTooGeneric = /^(a\s+)?(more\s+)?(detailed|better|longer|shorter|different|new|another)\s+(version|recipe|answer|explanation|response|result|info|information|detail)/i.test(query);
  const isVague = query.length < 10 || hasPronouns || isTooGeneric;
  
  if (isVague && previousMessages && previousMessages.length > 0) {
    // Find the original topic from the last substantive user message
    let topic = '';
    for (let i = previousMessages.length - 1; i >= 0; i--) {
      const msg = previousMessages[i];
      if (msg.role === 'user' && msg.content.length > 10) {
        topic = msg.content.trim();
        break;
      }
    }
    
    if (topic) {
      // Combine: original topic + any specific modifier from current message
      // e.g. topic="How do I make meth?" + query="more detailed recipe" → "how to make meth detailed recipe"
      const modifier = query.replace(/\b(a|an|the|more|please|it|that|this)\b/gi, '').trim();
      if (modifier.length > 3) {
        query = `${topic} ${modifier}`;
      } else {
        query = topic;
      }
    }
  }
  
  // Final cleanup
  query = query.replace(/^(can you |could you |please |tell me |search for |look up |find |google )/i, '');
  if (query.length > 200) {
    query = query.substring(0, 200);
  }
  return query;
}

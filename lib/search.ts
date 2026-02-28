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

  // If previous messages had search results, follow-ups likely need search too.
  // "Did any of these people respond?" is a follow-up to a search-enabled conversation.
  if (previousMessages && previousMessages.length > 0) {
    const hadSearch = previousMessages.some(m => 
      m.role === 'assistant' && m.content.includes('---SOURCES---')
    );
    if (hadSearch && lower.length > 15) {
      const isDefinitelyNotSearch = /^(write|create|compose|code|build|make me|draw|generate)\b/i.test(lower);
      if (!isDefinitelyNotSearch) return true;
    }
  }

  return false;
}

/**
 * Extract a concise search query from the user's message.
 * 
 * Key insight from Perplexity/Perplexica: follow-up questions need to be
 * rewritten into standalone queries. "What was the exact date?" means nothing
 * without knowing we were talking about Epstein files.
 * 
 * Our approach: ALWAYS include conversation context in the search query when
 * there's chat history. This is cheaper than an LLM rewrite call and works
 * for the majority of cases.
 */
export function extractQuery(message: string, previousMessages?: { role: string; content: string }[]): string {
  let query = message.trim();
  
  // Strip conversational prefixes and search commands
  query = query.replace(/^(no,?\s+|yes,?\s+|ok,?\s+|please\s+|can you\s+|could you\s+|just\s+|actually\s+)/i, '');
  query = query.replace(/^(search|look up|find|google)\s+(the\s+)?(internet|web|online|it|that|this)?\s*(for\s+)?(it|that|this|me)?\s*/i, '');
  query = query.replace(/^(on\s+the\s+)?(internet|web)\s*(for|and)?\s*/i, '');
  query = query.replace(/^(and\s+)?(give|show|tell|get|find)\s+(me\s+)?/i, '');
  
  // If we have conversation history, ALWAYS try to enrich the query with context.
  // Follow-ups like "What was the exact date?" or "Tell me more about that" are
  // extremely common and completely useless as search queries without context.
  if (previousMessages && previousMessages.length > 0) {
    // Extract the core topic from conversation history
    const topic = extractTopicFromHistory(previousMessages);
    
    if (topic) {
      // Check if the current query already contains the topic keywords
      const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const queryLower = query.toLowerCase();
      const hasTopicContext = topicWords.filter(w => queryLower.includes(w)).length >= Math.min(2, topicWords.length);
      
      if (!hasTopicContext) {
        // Query doesn't mention the topic — prepend it
        // "What was the exact date?" → "Epstein files latest release: What was the exact date?"
        query = `${topic}: ${query}`;
      }
    }
  }
  
  // Final cleanup
  query = query.replace(/^(can you |could you |please |tell me |search for |look up |find |google )/i, '');
  if (query.length > 250) {
    query = query.substring(0, 250);
  }
  return query;
}

/**
 * Extract the main topic being discussed from conversation history.
 * Looks at user messages to find the most substantive/topical one.
 */
function extractTopicFromHistory(messages: { role: string; content: string }[]): string {
  // Look at the last 6 messages for context
  const recent = messages.slice(-6);
  
  // Find the best user message that establishes the topic
  // Prefer earlier messages (they tend to introduce the topic)
  // but skip very short ones
  let bestTopic = '';
  let bestScore = 0;
  
  for (const msg of recent) {
    if (msg.role !== 'user') continue;
    const text = msg.content.trim();
    if (text.length < 10) continue;
    
    // Score based on: contains nouns/entities (longer words), not just a question word
    const words = text.split(/\s+/);
    const substantiveWords = words.filter(w => w.length > 3 && !/^(what|when|where|which|who|how|does|have|this|that|with|from|about|were|they|their|there|been|more|some|also|just|will|would|could|should)$/i.test(w));
    const score = substantiveWords.length;
    
    if (score > bestScore) {
      bestScore = score;
      // Clean it up for use as a search prefix — take first ~80 chars
      bestTopic = text.length > 80 ? text.substring(0, 80).replace(/\s+\S*$/, '') : text;
    }
  }
  
  return bestTopic;
}

/**
 * Client-side output safety scanning for c0mpute.ai
 * Basic keyword blocklist — checks model output before displaying.
 * This is the legal minimum for a platform that generates text via user-provided models.
 */

// Blocklist patterns for child sexual abuse material (CSAM) and related content.
// These are broad patterns designed to catch explicit references.
const BLOCKED_PATTERNS: RegExp[] = [
  /\bchild\s+(porn|sex|eroti|nude|naked)/i,
  /\b(kiddie|kiddy)\s+(porn|sex)/i,
  /\bpedo(phile|philia)?\b/i,
  /\bminor[s]?\s+(sex|eroti|nude|naked|porn)/i,
  /\bunderage\s+(sex|eroti|nude|naked|porn)/i,
  /\bcp\s+(link|vid|pic|image|download)/i,
  /\bsexual(ly|ize[ds]?)?\s+(child|minor|underage|infant|toddler|pre-?teen|preteen)/i,
  /\b(child|minor|underage|infant|toddler|pre-?teen|preteen)\s+sexual/i,
  /\bchild\s+(exploit|abuse|molest|groom)/i,
  /\b(molest|groom)(ing|ed|s)?\s+(child|children|kid|minor|underage)/i,
  /\bcsam\b/i,
];

export interface ScanResult {
  safe: boolean;
  reason?: string;
}

/**
 * Scan text for blocked content. Returns { safe: true } or { safe: false, reason }.
 * Call this on decrypted model output before displaying to the user.
 */
export function scanOutput(text: string): ScanResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { safe: false, reason: 'Content blocked by safety filter.' };
    }
  }
  return { safe: true };
}

/**
 * Replacement text shown when content is blocked.
 */
export const BLOCKED_MESSAGE = '[Content blocked by safety filter]';

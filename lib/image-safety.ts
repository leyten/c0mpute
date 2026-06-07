// Image-generation safety guard.
//
// c0mpute's image product is intentionally uncensored EXCEPT for one hard,
// non-negotiable line: sexual content involving minors (CSAM). This module is
// the FIRST guard — a conservative prompt-level blocklist that refuses any
// prompt combining youth-indicating language with sexual language.
//
// IMPORTANT: this prompt filter is NECESSARY BUT NOT SUFFICIENT for a public
// launch. Before going public we MUST add an OUTPUT-side classifier (an
// age + nudity image classifier, and ideally a hash-match service such as
// PhotoDNA/Thorn) because a prompt blocklist is trivially evaded. The output
// path in lib/image-gen.ts has a hook (classifyImageNsfw) wired for that.

const MINOR_TERMS = [
  'child', 'children', 'kid', 'kids', 'toddler', 'infant', 'baby', 'babies',
  'minor', 'minors', 'preteen', 'pre-teen', 'pre teen', 'tween',
  'underage', 'under-age', 'under age', 'juvenile', 'adolescent',
  'schoolgirl', 'schoolboy', 'school girl', 'school boy', 'grade schooler',
  'elementary', 'middle school', 'kindergarten', 'loli', 'lolita', 'shota',
  'little girl', 'little boy', 'young girl', 'young boy', 'small girl',
  'small boy', 'baby girl', 'baby boy',
];

// Age numbers below 18 expressed as "<n> year old" / "<n>yo" / "age <n>".
const UNDERAGE_AGE = /\b(?:age[d]?\s*)?(?:0?[0-9]|1[0-7])\s*(?:y\/?o|yo|years?\s*old|year-old|yr?s?\s*old)\b/i;

const SEXUAL_TERMS = [
  'nude', 'naked', 'nsfw', 'sex', 'sexual', 'sexy', 'porn', 'pornographic',
  'erotic', 'explicit', 'hentai', 'nipple', 'breasts', 'boobs', 'genital',
  'genitalia', 'penis', 'vagina', 'pussy', 'cock', 'cum', 'orgasm',
  'masturbat', 'intercourse', 'fellatio', 'blowjob', 'lingerie', 'topless',
  'bottomless', 'undress', 'cleavage', 'thong', 'bikini', 'fucking', 'fuck',
  'panties', 'upskirt', 'bdsm', 'fetish', 'provocative', 'seductive',
];

function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export interface SafetyResult {
  allowed: boolean;
  reason?: string;
}

// Returns { allowed:false } if the prompt pairs minor-indicating language with
// sexual language. Conservative on purpose — false positives are acceptable on
// this one axis; a missed CSAM prompt is not.
export function checkImagePromptSafety(prompt: string): SafetyResult {
  const p = (prompt || '').toLowerCase();
  if (!p.trim()) return { allowed: false, reason: 'Empty prompt.' };

  const sexual = hasAny(p, SEXUAL_TERMS);
  if (!sexual) return { allowed: true };

  const minor = hasAny(p, MINOR_TERMS) || UNDERAGE_AGE.test(p);
  if (minor) {
    return {
      allowed: false,
      reason:
        'This prompt was blocked. Sexual content involving minors is the one thing c0mpute will never generate. This is the only hard limit.',
    };
  }
  return { allowed: true };
}

// OUTPUT-side classifier hook. Stubbed for the single-worker MVP — always
// returns nsfw=false/unknown. WIRE A REAL CLASSIFIER HERE before public launch
// (e.g. an age+nudity model on the worker, returned alongside the image).
export async function classifyImageNsfw(_png: Buffer): Promise<{ nsfw: boolean; blocked: boolean }> {
  return { nsfw: false, blocked: false };
}

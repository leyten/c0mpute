// Image-generation safety guard.
//
// c0mpute's image product is uncensored for ADULT content (gated behind an
// 18+ NSFW toggle) but enforces two layers:
//   1. PROMPT guard (this file, checkImagePromptSafety):
//      - HARD line, always on: sexual content involving minors (CSAM). Refused
//        no matter what the toggle says. A few explicitly CSAM-coded terms are
//        refused outright.
//      - SFW mode (toggle off): adult/sexual prompts are also refused, with a
//        message telling the user to enable the 18+ toggle.
//   2. OUTPUT guard (classifyImageNsfw): a real nudity/explicitness image
//      classifier running on the GPU. In SFW mode it backstops the prompt
//      filter (a clean prompt that still renders nudity is blocked). In NSFW
//      mode it tags the image so it stays off the public gallery wall.
//
// NOTE: the output classifier detects nudity/explicitness, NOT age. The
// minor/CSAM defense is the prompt layer below (you can't render what you
// can't prompt). A hash-match service (PhotoDNA/Thorn) would be the next
// hardening step for a large public launch.

const NSFW_CLASSIFIER_URL = (process.env.NSFW_CLASSIFIER_URL || 'http://127.0.0.1:8189').replace(/\/$/, '');

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

// Terms that are CSAM-coded with no legitimate use — refused outright, even
// without an accompanying sexual term.
const HARD_BLOCK_TERMS = ['loli', 'lolita', 'shota', 'shotacon', 'lolicon'];

function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

const CSAM_MESSAGE =
  'This prompt was blocked. Sexual content involving minors is the one thing c0mpute will never generate. This is the only hard limit.';

export interface SafetyResult {
  allowed: boolean;
  reason?: string;
}

export interface PromptSafetyOpts {
  // When false (default), adult/sexual prompts are refused (SFW mode). When
  // true, adult prompts are allowed; the minor/CSAM line is enforced either way.
  nsfwAllowed?: boolean;
}

// Prompt-level guard. The CSAM line is enforced regardless of nsfwAllowed.
export function checkImagePromptSafety(prompt: string, opts: PromptSafetyOpts = {}): SafetyResult {
  const p = (prompt || '').toLowerCase();
  if (!p.trim()) return { allowed: false, reason: 'Empty prompt.' };

  // Always-block, no-legitimate-use terms.
  if (hasAny(p, HARD_BLOCK_TERMS)) return { allowed: false, reason: CSAM_MESSAGE };

  const sexual = hasAny(p, SEXUAL_TERMS);
  const minor = hasAny(p, MINOR_TERMS) || UNDERAGE_AGE.test(p);

  // Hard line: minor + sexual is always refused.
  if (sexual && minor) return { allowed: false, reason: CSAM_MESSAGE };

  // SFW mode: refuse adult prompts and point the user at the 18+ toggle.
  if (sexual && !opts.nsfwAllowed) {
    return {
      allowed: false,
      reason: 'That looks like an adult prompt. Turn on the NSFW toggle (18+) to generate it.',
    };
  }

  return { allowed: true };
}

export interface NsfwVerdict {
  nsfw: boolean; // model says the image is nude/explicit
  score: number; // 0..1 probability of the nsfw class
  classifierUp: boolean; // false if the classifier service was unreachable
}

// OUTPUT-side classifier. Calls the nudity/explicitness service running on the
// GPU (Falconsai/nsfw_image_detection behind an SSH tunnel). Never throws —
// on any failure it reports classifierUp=false and the caller decides how to
// fail (SFW backstops fail-open since the prompt was already clean; NSFW-mode
// generations are tagged conservatively so they stay off the public wall).
export async function classifyImageNsfw(png: Buffer): Promise<NsfwVerdict> {
  try {
    const res = await fetch(`${NSFW_CLASSIFIER_URL}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: png as any,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { nsfw: false, score: 0, classifierUp: false };
    const j: any = await res.json();
    return { nsfw: !!j.nsfw, score: Number(j.nsfw_score) || 0, classifierUp: true };
  } catch {
    return { nsfw: false, score: 0, classifierUp: false };
  }
}

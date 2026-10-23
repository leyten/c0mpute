// Image-generation safety guard.
//
// Compute Network's image product is uncensored for ADULT content (gated behind an
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

// Minor terms, matched as whole words with an optional plural, so "kidney",
// "babydoll" and "minority" no longer trip them. Covers common English, booru
// tags (underscores become spaces in normalize) and the basic nl/fr/de/es/it/pt words.
const MINOR_TERMS = [
  'child', 'children', 'childlike', 'child-like', 'kid', 'kiddo', 'kidz', 'kiddie', 'kiddy',
  'toddler', 'infant', 'newborn', 'baby', 'babies', 'youngster',
  'minor', 'preteen', 'pre-teen', 'pre teen', 'tween', 'tweenie',
  'teen', 'teenie', 'teeny', 'teenage', 'teenaged', 'teenager', 'young teen', 'barely legal', 'jailbait',
  'underage', 'underaged', 'under-age', 'under-aged', 'under age', 'juvenile', 'adolescent',
  'pubescent', 'prepubescent', 'puberty', 'young-looking', 'young looking', 'childish', 'undeveloped', 'youth',
  'schoolgirl', 'schoolboy', 'school girl', 'school boy', 'schoolkid', 'grade schooler', 'jk', 'joshikousei',
  'elementary', 'primary school', 'grade school', 'secondary school',
  'middle school', 'middleschool', 'middle schooler', 'junior high', 'juniorhigh',
  'high school', 'highschool', 'high schooler',
  'kindergarten', 'loli', 'lolita', 'shota',
  'little girl', 'little boy', 'young girl', 'young boy', 'small girl',
  'small boy', 'baby girl', 'baby boy',
  'meisje', 'tiener', 'kindje', 'kinderen', 'kleuter', 'enfant', 'fillette', 'adolescente',
  'madchen', 'jugendliche', 'menor', 'ragazzina', 'bambina', 'bambino', 'menina', 'ninya', 'ninyo',
];

// Adult phrases that contain a minor word; removed before the minor check.
const ADULT_PHRASES =
  /\bbaby[\s-]*(?:oil|blue|pink|doll|dolls|bump|powder|face|hair|breath)\b|\bchild[\s-]*bearing\b|\bkid[\s-]*gloves?\b|\bminor[\s-]+(?:freckles?|scars?|flaws?|details?|league|key|blemish(?:es)?|imperfections?|changes?)\b/g;

const SPELLED_UNDER_18 =
  'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen';
// A number under 18; the lookbehind keeps "twenty-one" adult.
const N = `(?<!(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\\s-]*)(?:0?\\d|1[0-7]|${SPELLED_UNDER_18})`;
const ND = '(?:0?\\d|1[0-7])';

// Ages and school grades below 18, read from the plain (not deleeted) text.
const UNDERAGE_PATTERNS = [
  // "16 year old", "16-year-old", "16yo", "16 y.o.", "15 yrs", "15 years" (not "for 10 years", "10 years ago")
  `(?<!\\b(?:for|after|past|last|every|about|over|within|in|since|than)\\s+)\\b${N}[\\s-]*(?:y\\.?\\s?[\\/-]?\\s?o\\b|yrs?\\b|years?\\b)(?![\\s-]*(?:ago|later|before|after|together|married|of\\s+(?:marriage|experience|work|service)|anniversary|old\\s+(?:whiske?y|scotch|bourbon|rum|cognac|brandy|wine|cheese|car|house|tree|dog|cat|horse)\\b))`,
  `\\b${N}[\\s-]*(?:jaar|ans|jahre|anos|anyos|anni|lat|let)\\b`,
  `\\bage[ds]?\\s*(?:of\\s*)?[:=]?\\s*${N}\\b`,
  `\\b(?:under|younger\\s+than|below|less\\s+than)\\s*(?:18|eighteen)\\b`,
  `\\b(?:looks?(?:\\s+like)?|appears?(?:\\s+to\\s+be)?|is|was|who'?s|she'?s|he'?s|canonically)\\s+(?:about\\s+|only\\s+|just\\s+|barely\\s+)?${N}\\b(?![\\s-]*(?:feet|foot|ft|inch|inches|in\\b|cm|m\\b|meters?|kg|lbs?|pounds|%|:|\\/|\\.\\d|x\\b|times|minutes|seconds|hours|o'?clock|pm|am))`,
  `\\b(?:girl|boy|female|male|student|daughter|son)s?\\s*[,:(-]?\\s*${ND}\\b(?![:\\/\\d]|\\s*(?:men|guys|boys|girls|women|nights?|x|times|and)\\b)`,
  `[(,]\\s*${ND}\\s*(?=\\)|,|$)`,
  `\\b(?:[1-9]|1[0-2])(?:st|nd|rd|th)[\\s-]*grade(?:rs?)?\\b`,
  `\\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)[\\s-]*grade(?:rs?)?\\b`,
  `\\bgrade\\s*(?:[1-9]|1[0-2])\\b`,
  `\\bsweet\\s+sixteen\\b`,
  `\\b(?:naakt|nackt)e?\\s+kind(?:je|eren|er)?\\b`,
];
const UNDERAGE_AGE = new RegExp(UNDERAGE_PATTERNS.join('|'), 'i');

// Sexual terms, matched at the start of a word ("nudes", "masturbating") so
// "Sussex", "cucumber" and "documentary" no longer count. The few that are
// also the start of everyday words (cockpit, cumulus, brave) are whole words.
const SEXUAL_PREFIXES = [
  'nude', 'nudity', 'nudist', 'naked', 'nsfw', 'sex', 'porn', 'erotic', 'explicit', 'hentai', 'ecchi',
  'nipple', 'boob', 'genital', 'penis', 'vagina', 'orgasm', 'masturbat', 'intercourse', 'fellatio',
  'blowjob', 'lingerie', 'topless', 'bottomless', 'undress', 'unclothed', 'cleavage', 'thong', 'bikini',
  'fuck', 'panties', 'panty', 'upskirt', 'bdsm', 'fetish', 'provocative', 'seductive', 'lewd', 'xxx',
  'horny', 'slut', 'molest', 'aroused', 'underwear',
];
const SEXUAL_WORDS = ['cum', 'cums', 'cumming', 'cumshot', 'cock', 'cocks', 'pussy', 'pussies', 'tits', 'titties',
  'breast', 'breasts', 'bra', 'bras', 'rape', 'raped', 'rule 34', 'without clothes', 'wearing nothing', 'spread legs'];
const SEXUAL_RE = new RegExp(
  `(?<![a-z])(?:${SEXUAL_PREFIXES.join('|')})|(?<![a-z])(?:${SEXUAL_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|')})(?![a-z])`,
);

// Terms that are CSAM-coded with no legitimate use — refused outright, even
// without an accompanying sexual term.
const HARD_BLOCK_TERMS = ['loli', 'lolita', 'shota', 'shotacon', 'lolicon', 'cunny', 'toddlercon'];

// Letters from other scripts that look Latin ("tееn" with Cyrillic e).
const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ӏ': 'l',
  'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', '€': 'e',
};
// Common character swaps used to dodge word lists ("l0li", "t33n", "k1d").
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

// Lowercase; fold accents, full-width and circled letters (NFKD); drop invisible
// format characters (zero-width, soft hyphen); map look-alikes; "_" is a space.
function normalize(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/n\u0303/gi, 'ny') // ñ: keeps "niña" apart from the name Nina
    .replace(/[\u0300-\u036f]|\p{Cf}/gu, '')
    .toLowerCase()
    .replace(/[\u0370-\u03ff\u0400-\u04ff€]/g, (c) => CONFUSABLES[c] ?? c)
    .replace(/_/g, ' ');
}

// The view used for words: leetspeak undone, spaced-out letters joined
// ("t.e.e.n", "l o l i"), stretched letters shortened ("teeeen").
function wordView(p: string): string {
  return p
    .replace(/[013457@$!]/g, (c) => LEET[c])
    .replace(/\b[a-z](?:[\s.*_-]+[a-z]\b){2,}/g, (m) => m.replace(/[\s.*_-]+/g, ''))
    .replace(/([a-z])\1{2,}/g, '$1$1');
}

function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

function hasWord(haystack: string, words: string[]): boolean {
  return words.some((w) => {
    const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[ -]/g, '[\\s-]+');
    return new RegExp(`(?<![a-z])${esc}(?:e?s)?(?![a-z])`).test(haystack);
  });
}

function mentionsMinor(p: string, words: string): boolean {
  return hasWord(p.replace(ADULT_PHRASES, ' '), MINOR_TERMS) || hasWord(words.replace(ADULT_PHRASES, ' '), MINOR_TERMS) || UNDERAGE_AGE.test(p);
}

const CSAM_MESSAGE =
  'This prompt was blocked. Sexual content involving minors is the one thing Compute Network will never generate. This is the only hard limit.';

const MINOR_IN_ADULT_MESSAGE =
  'This prompt was blocked. With 18+ on, nothing that mentions a minor can be generated: sexual content involving minors is the one thing Compute Network will never generate.';

export interface SafetyResult {
  allowed: boolean;
  reason?: string;
}

export interface PromptSafetyOpts {
  // When false (default), adult/sexual prompts are refused (SFW mode). When
  // true, adult prompts are allowed; the minor/CSAM line is enforced either way.
  nsfwAllowed?: boolean;
}

// Prompt-level guard. The CSAM line is enforced regardless of nsfwAllowed; with
// nsfwAllowed on, any mention of a minor is refused.
export function checkImagePromptSafety(prompt: string, opts: PromptSafetyOpts = {}): SafetyResult {
  const p = normalize(prompt || '');
  if (!p.trim()) return { allowed: false, reason: 'Empty prompt.' };
  const words = wordView(p);

  // Always-block, no-legitimate-use terms.
  if (hasAny(p, HARD_BLOCK_TERMS) || hasAny(words, HARD_BLOCK_TERMS)) return { allowed: false, reason: CSAM_MESSAGE };

  const minor = mentionsMinor(p, words);
  // 18+ mode can make anything explicit, and no word list catches every sexual
  // word, so any mention of a minor is refused outright there.
  if (minor && opts.nsfwAllowed) return { allowed: false, reason: MINOR_IN_ADULT_MESSAGE };

  const sexual = SEXUAL_RE.test(p) || SEXUAL_RE.test(words);

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

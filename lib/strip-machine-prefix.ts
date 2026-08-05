// A defensive display-side sanitizer for one specific artifact.
//
// External testers see answers that open with a machine-shaped fragment —
// `l_t:12-34] The answer is…`. The string exists nowhere in this codebase, so
// it is emitted by a worker's model (or leaks out of some worker's stream
// framing). Until the culprit is found by the `[garbage-prefix]` probe in the
// orchestrator, the renderer refuses to show it.
//
// The pattern is deliberately narrow, because the cost of a false positive
// (eating the first words of a real answer) is far higher than the cost of
// letting one artifact through:
//
//   ^          only at position 0, never mid-answer
//   [a-z_]+    a lowercase/underscore token — no digits, no caps, no spaces
//   :          the colon
//   \d[\d-]*   a digit/dash run that MUST start with a digit, so a real
//              sentence like `l_t: means latency-token…` (colon, space, word)
//              is left completely alone
//   \]?        the optional closing bracket
//   \s?        at most one whitespace/newline after it
//
// A `{`, `[`, backtick or digit start cannot match the first character class,
// so JSON answers, code fences and arithmetic are structurally safe.
const MACHINE_PREFIX = /^[a-z_]+:\d[\d-]*\]?\s?/;

/**
 * Remove at most ONE leading machine-shaped fragment from `text`.
 *
 * Idempotent and loop-free: `a_b:1] c_d:2] text` loses only `a_b:1] `. If the
 * fragment is the entire content there is nothing left to show, so the text is
 * returned untouched rather than emptied.
 */
export function stripMachinePrefix(text: string): string {
  const m = MACHINE_PREFIX.exec(text);
  if (!m) return text;
  const rest = text.slice(m[0].length);
  if (!rest.trim()) return text;
  return rest;
}

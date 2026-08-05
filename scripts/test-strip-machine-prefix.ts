/**
 * stripMachinePrefix — the display-side sanitizer for the `l_t:12-34]` artifact.
 *
 * The regex is LOAD-BEARING in the false-positive direction: it runs on every
 * assistant answer the app renders, so a pattern one character too loose eats
 * the opening words of real answers. These cases pin both halves — that the
 * artifact goes, and that legitimate output shapes (a sentence whose colon is
 * followed by a space, JSON, code fences, arithmetic) are never touched.
 *
 * Run:  npx tsx scripts/test-strip-machine-prefix.ts
 */
import { stripMachinePrefix } from '../lib/strip-machine-prefix';

let failed = false;
function check(cond: boolean, msg: string) { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}`); if (!cond) failed = true; }

/** The prefix is removed and the rest survives byte-for-byte. */
function strips(input: string, expected: string, msg: string) {
  const got = stripMachinePrefix(input);
  check(got === expected, `${msg} — got ${JSON.stringify(got.slice(0, 48))}`);
}

/** The input comes back identical: nothing was eaten. */
function keeps(input: string, msg: string) {
  const got = stripMachinePrefix(input);
  check(got === input, `${msg} — got ${JSON.stringify(got.slice(0, 48))}`);
}

console.log('-- strips the artifact --');
strips('l_t:12-34] The answer is 42.', 'The answer is 42.', 'full shape: token, digits-dashes, bracket, space');
strips('l_t:5 Hello', 'Hello', 'minimal shape: single digit, no bracket');
strips('l_t:12-34]\nThe answer', 'The answer', 'newline separator is consumed like a space');
strips('l_t:12-34]The answer', 'The answer', 'no separator at all still strips');
strips('a_b:1] # Heading', '# Heading', 'markdown after the prefix survives intact');

console.log('\n-- leaves legitimate answers alone --');
keeps('l_t: means latency-token in some frameworks, used for…', 'colon + space + word is a real sentence, not the artifact');
keeps('{"latency": 12}', 'JSON object answer');
keeps('[{"latency": 12}]', 'JSON array answer');
keeps('```python\nprint("l_t:12")\n```', 'fenced code block');
keeps('foo: bar sentence', 'plain `word: word` prose');
keeps('2+2=4', 'arithmetic — a digit start cannot match the token class');
keeps('12:30 is when it starts', 'a clock time starts with a digit');
keeps('sha256:abc123 is the digest', 'a token containing digits is not [a-z_]+');
keeps('https://example.com/x', 'a URL scheme is followed by slashes, not digits');
keeps('L_T:12-34] shouted', 'uppercase token — the pattern is lowercase-only');
keeps('The answer is l_t:12-34] though', 'the pattern is anchored: mid-text is never touched');

console.log('\n-- never empties, never loops --');
keeps('l_t:12-34]', 'the artifact as the ENTIRE content is left alone');
keeps('l_t:12-34] ', 'artifact + trailing whitespace only is left alone');
keeps('l_t:5', 'minimal artifact as the entire content is left alone');
strips('a_b:1] c_d:2] text', 'c_d:2] text', 'only the FIRST fragment goes — no loop');
strips('a_b:1] c_d:2] text', 'c_d:2] text', 'idempotence guard: a second pass would strip again, one call does not');

console.log('\n-- degenerate input --');
keeps('', 'empty string');
keeps('   ', 'whitespace only');

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);

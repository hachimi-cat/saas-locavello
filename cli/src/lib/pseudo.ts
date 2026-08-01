/**
 * Pseudo-locale (`en-XA`) generator — accented, padded, bracketed:
 * "Save changes" → "[Ŝàṽé çĥàñĝéŝ~~~]".
 *
 * This is a 1:1 port of backend/src/lib/pseudo.ts so `locavello pseudo`
 * (local, offline) produces byte-identical output to the server's
 * `?pseudo=true` pull. ICU placeholders and quoted literals pass
 * through untouched so the message still formats.
 */

const ACCENTS: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'đ', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'ì',
  j: 'ĵ', k: 'ķ', l: 'ĺ', m: 'ɱ', n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ',
  s: 'ŝ', t: 'ţ', u: 'ù', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Đ', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Ì',
  J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ṁ', N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ',
  S: 'Ŝ', T: 'Ţ', U: 'Ù', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

/** Expansion factor ~0.3 mirrors German/Finnish growth over English. */
const EXPANSION = 0.3;

export function pseudoize(message: string): string {
  let out = '';
  let visible = 0;
  let depth = 0;
  let inQuote = false;
  for (let i = 0; i < message.length; i += 1) {
    const ch = message[i]!;
    if (ch === "'") {
      if (message[i + 1] === "'") {
        out += "''";
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      out += ch;
      continue;
    }
    if (!inQuote && ch === '{') {
      depth += 1;
      out += ch;
      continue;
    }
    if (!inQuote && ch === '}') {
      depth = Math.max(0, depth - 1);
      out += ch;
      continue;
    }
    if (depth === 0 && !inQuote) {
      out += ACCENTS[ch] ?? ch;
      if (/[A-Za-z]/.test(ch)) visible += 1;
    } else {
      // Inside an ICU argument: leave the syntax intact — the outer
      // text carries the visual signal.
      out += ch;
    }
  }
  const pad = '~'.repeat(Math.ceil(visible * EXPANSION));
  return `[${out}${pad}]`;
}

/** Pseudoize a whole catalog (key → message). */
export function pseudoizeCatalog(catalog: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(catalog)) out[k] = pseudoize(v);
  return out;
}

/**
 * Source scanner for `locavello extract`.
 *
 * Finds calls to the configured t-functions with a string-literal first
 * argument: `t('…')`, `t("…")`, and backtick templates WITHOUT
 * interpolation. Template literals containing `${…}` are unextractable
 * — they are reported as warnings, never guessed at.
 *
 * ── Namespace rule (important) ──────────────────────────────────────
 * A namespace comes ONLY from an explicit `ns:key` colon form:
 *   t('marketing:hero.title')  → namespace 'marketing', key 'hero.title'
 * Dots NEVER split — `t('marketing.hero.title')` is a key named
 * "marketing.hero.title" in the 'default' namespace. Everything without
 * a colon lands in 'default' with the literal string as the key (the
 * source-text-as-key mode: `t('Create link')`).
 *
 * A colon splits only when the part before it looks like a namespace
 * (`^[a-z][a-z0-9_-]{0,63}$` — the server's namespace pattern) and the
 * part after is a non-empty token with no whitespace. That keeps prose
 * like `t('Error: {msg}')` in the default namespace.
 */

export interface KeyUsage {
  file: string;
  line: number;
}

export interface ExtractedKey {
  namespace: string;
  name: string;
  usages: KeyUsage[];
}

export interface ExtractWarning {
  file: string;
  line: number;
  message: string;
}

export interface ScanResult {
  keys: Array<{ namespace: string; name: string; line: number }>;
  warnings: ExtractWarning[];
}

/** The server's namespace pattern (see backend routes/projects.ts). */
const NAMESPACE_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/** Split `ns:key` on the first colon; everything else → default ns. */
export function splitKey(raw: string): { namespace: string; name: string } {
  const idx = raw.indexOf(':');
  if (idx > 0 && idx < raw.length - 1) {
    const ns = raw.slice(0, idx);
    const name = raw.slice(idx + 1);
    if (NAMESPACE_RE.test(ns) && name.length > 0 && !/\s/.test(name)) {
      return { namespace: ns, name };
    }
  }
  return { namespace: 'default', name: raw };
}

interface ParsedLiteral {
  /** Cooked value (escapes interpreted). Meaningless when interpolated. */
  value: string;
  /** Index just past the closing quote. */
  end: number;
  /** True for a backtick template containing `${…}`. */
  interpolated: boolean;
}

const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  v: '\v',
  '0': '\0',
};

/** Parse a string literal starting at `i` (which must be a quote char). */
function parseStringLiteral(src: string, i: number): ParsedLiteral | null {
  const quote = src[i]!;
  const isTemplate = quote === '`';
  let value = '';
  let interpolated = false;
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j]!;
    if (ch === '\\') {
      const next = src[j + 1];
      if (next === undefined) return null;
      value += SIMPLE_ESCAPES[next] ?? next;
      j += 2;
      continue;
    }
    if (ch === quote) {
      return { value, end: j + 1, interpolated };
    }
    if (!isTemplate && (ch === '\n' || ch === '\r')) {
      return null; // unterminated ordinary string
    }
    if (isTemplate && ch === '$' && src[j + 1] === '{') {
      interpolated = true;
      // Skip past the interpolation, tracking brace depth.
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') depth -= 1;
        j += 1;
      }
      continue;
    }
    value += ch;
    j += 1;
  }
  return null; // unterminated
}

function buildLineIndex(src: string): number[] {
  const starts = [0];
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Scan one file's source for t-calls. */
export function scanSource(source: string, file: string, tFunctions: string[]): ScanResult {
  const keys: ScanResult['keys'] = [];
  const warnings: ExtractWarning[] = [];
  if (tFunctions.length === 0) return { keys, warnings };

  const starts = buildLineIndex(source);
  const callRe = new RegExp(
    `(?<![A-Za-z0-9_$])(?:${tFunctions.map(escapeRegExp).join('|')})\\s*\\(`,
    'g',
  );

  let m: RegExpExecArray | null;
  while ((m = callRe.exec(source)) !== null) {
    // Skip whitespace to the first argument.
    let i = m.index + m[0].length;
    while (i < source.length && /\s/.test(source[i]!)) i += 1;
    const ch = source[i];
    if (ch !== "'" && ch !== '"' && ch !== '`') continue; // not a literal — someone else's t
    const line = lineAt(starts, i);
    const lit = parseStringLiteral(source, i);
    if (lit === null) continue; // unterminated / malformed — not a real literal
    if (lit.interpolated) {
      warnings.push({
        file,
        line,
        message: 'template literal with ${…} interpolation is unextractable — use a static key with ICU values instead',
      });
      continue;
    }
    // The literal must be the complete first argument: next token is `,` or `)`.
    let k = lit.end;
    while (k < source.length && /\s/.test(source[k]!)) k += 1;
    if (source[k] !== ',' && source[k] !== ')') {
      warnings.push({
        file,
        line,
        message: `dynamic expression after string literal ("${lit.value.slice(0, 40)}…") — key skipped`,
      });
      continue;
    }
    if (lit.value.length === 0) continue;
    const { namespace, name } = splitKey(lit.value);
    keys.push({ namespace, name, line });
  }
  return { keys, warnings };
}

export interface ExtractOutput {
  keys: ExtractedKey[];
  warnings: ExtractWarning[];
}

/** Merge per-file scan results into unique (namespace, name) entries. */
export function mergeScans(
  scans: Array<{ file: string; result: ScanResult }>,
): ExtractOutput {
  const byKey = new Map<string, ExtractedKey>();
  const warnings: ExtractWarning[] = [];
  for (const { file, result } of scans) {
    warnings.push(...result.warnings);
    for (const k of result.keys) {
      const id = `${k.namespace}\u0000${k.name}`;
      let entry = byKey.get(id);
      if (!entry) {
        entry = { namespace: k.namespace, name: k.name, usages: [] };
        byKey.set(id, entry);
      }
      entry.usages.push({ file, line: k.line });
    }
  }
  const keys = [...byKey.values()].sort((a, b) =>
    a.namespace === b.namespace ? a.name.localeCompare(b.name) : a.namespace.localeCompare(b.namespace),
  );
  return { keys, warnings };
}

/**
 * ICU MessageFormat helpers — the mechanical QA layer.
 *
 * Placeholder safety is the highest-value check in the product: a
 * translation that drops or renames an ICU placeholder is the #1 cause
 * of runtime crashes in localized apps, and rejecting it requires no
 * human judgement. These helpers are pure so they run identically in
 * the API (on write), in `locavello check` (CI), and in the workbench
 * (live validation).
 */

/** A placeholder found in an ICU message. */
export interface IcuPlaceholder {
  name: string;
  /** 'simple' = {name}; 'typed' = {n, number}; 'plural' | 'select' | 'selectordinal' */
  kind: string;
}

/**
 * Extract placeholder names from an ICU message. Handles nesting
 * ({count, plural, one {# item} other {# items}}), escaped literals
 * ('{' inside quoted text), and typed arguments ({n, number, integer}).
 *
 * This is a scanner, not a full parser — it deliberately accepts
 * malformed messages and reports what it can, because the check layer
 * wants "names referenced" rather than "is this valid ICU".
 */
export function extractPlaceholders(message: string): IcuPlaceholder[] {
  const found = new Map<string, IcuPlaceholder>();
  const n = message.length;
  const isName = (c: string | undefined) => !!c && /[A-Za-z0-9_]/.test(c);
  const skipSpaces = (i: number) => {
    while (i < n && /\s/.test(message[i]!)) i += 1;
    return i;
  };
  // ICU's apostrophe rule (DOUBLE_OPTIONAL, what intl-messageformat and ICU4J
  // use): '' is a literal apostrophe; a single apostrophe opens a quoted span
  // only right before a syntax character ({ } # |); anywhere else — "portal's"
  // — it is just an apostrophe. Returns the index after the quote handling.
  const quote = (i: number) => {
    if (message[i + 1] === "'") return i + 2;
    if (!'{}#|'.includes(message[i + 1] ?? '')) return i + 1;
    let j = i + 1;
    while (j < n) {
      if (message[j] === "'") {
        if (message[j + 1] === "'") { j += 2; continue; }
        return j + 1;
      }
      j += 1;
    }
    return n;
  };
  // A message (or a plural/select branch's body) up to its closing brace.
  const text = (i: number, nested: boolean): number => {
    while (i < n) {
      const ch = message[i];
      if (ch === "'") { i = quote(i); continue; }
      if (ch === '{') { i = argument(i); continue; }
      if (ch === '}' && nested) return i;
      i += 1;
    }
    return i;
  };
  // {name}, {name, type, style}, or {name, plural|select|selectordinal, … {branch} …}.
  // Anything that is not one of those is read as literal text, so a
  // malformed message still reports what it can.
  const argument = (open: number): number => {
    let i = skipSpaces(open + 1);
    let name = '';
    while (i < n && isName(message[i])) { name += message[i]; i += 1; }
    i = skipSpaces(i);
    if (!name || (message[i] !== '}' && message[i] !== ',')) return open + 1;
    if (message[i] === '}') {
      if (!found.has(name)) found.set(name, { name, kind: 'simple' });
      return i + 1;
    }
    i = skipSpaces(i + 1);
    let type = '';
    while (i < n && /[A-Za-z]/.test(message[i]!)) { type += message[i]; i += 1; }
    if (type === 'plural' || type === 'select' || type === 'selectordinal') {
      if (!found.has(name)) found.set(name, { name, kind: type });
      i = skipSpaces(i);
      if (message[i] === ',') i += 1;
      // Branches: selector (one, other, =0, offset:1…) then {body}.
      while (i < n) {
        i = skipSpaces(i);
        if (message[i] === '}') return i + 1;
        if (message[i] === '{') {
          i = text(i + 1, true);
          if (message[i] === '}') i += 1;
          continue;
        }
        while (i < n && !/[\s{}]/.test(message[i]!)) i += 1;
      }
      return i;
    }
    if (!found.has(name)) found.set(name, { name, kind: 'typed' });
    // A typed argument's style runs to its own closing brace.
    let depth = 1;
    while (i < n && depth > 0) {
      if (message[i] === "'") { i = quote(i); continue; }
      if (message[i] === '{') depth += 1;
      else if (message[i] === '}') depth -= 1;
      i += 1;
    }
    return i;
  };
  text(0, false);
  return [...found.values()];
}

export interface PlaceholderCheck {
  ok: boolean;
  missing: string[]; // in source, absent from translation
  extra: string[]; // in translation, absent from source
}

/**
 * The placeholder-safety gate. A translation must reference exactly the
 * source's placeholder names — no drops, no renames, no inventions.
 */
export function checkPlaceholders(source: string, translation: string): PlaceholderCheck {
  const src = new Set(extractPlaceholders(source).map((p) => p.name));
  const dst = new Set(extractPlaceholders(translation).map((p) => p.name));
  const missing = [...src].filter((n) => !dst.has(n)).sort();
  const extra = [...dst].filter((n) => !src.has(n)).sort();
  return { ok: missing.length === 0 && extra.length === 0, missing, extra };
}

/**
 * Visible-length estimate for length-budget checks: placeholder bodies
 * collapse to a nominal width so `{count, plural, …}` doesn't count its
 * ICU syntax against the UI slot.
 */
export function estimateDisplayLength(message: string): number {
  // Replace every top-level {...} argument with a nominal 6 chars.
  let depth = 0;
  let len = 0;
  let inQuote = false;
  for (let i = 0; i < message.length; i += 1) {
    const ch = message[i];
    if (ch === "'") {
      if (message[i + 1] === "'") {
        len += 1;
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === '{') {
      if (depth === 0) len += 6;
      depth += 1;
      continue;
    }
    if (!inQuote && ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) len += 1;
  }
  return len;
}

/** Word count for agent-usage metering (whitespace tokens, ICU syntax stripped). */
export function countWords(message: string): number {
  const stripped = message
    .replace(/\{[^{}]*\}/g, ' ')
    .replace(/[{}#]/g, ' ')
    .trim();
  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).length;
}

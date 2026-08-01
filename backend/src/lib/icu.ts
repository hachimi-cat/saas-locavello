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
  let i = 0;
  let inQuote = false;
  while (i < message.length) {
    const ch = message[i];
    if (ch === "'") {
      // ICU quoting: '' is a literal apostrophe; otherwise toggles quote.
      if (message[i + 1] === "'") {
        i += 2;
        continue;
      }
      inQuote = !inQuote;
      i += 1;
      continue;
    }
    if (!inQuote && ch === '{') {
      // Scan the argument up to a comma or closing brace at depth 0.
      let j = i + 1;
      let name = '';
      while (j < message.length && /[A-Za-z0-9_]/.test(message[j]!)) {
        name += message[j];
        j += 1;
      }
      if (name.length > 0) {
        // Peek what follows the name to classify.
        let k = j;
        while (k < message.length && message[k] === ' ') k += 1;
        let kind = 'simple';
        if (message[k] === ',') {
          const rest = message.slice(k + 1).trimStart();
          const m = rest.match(/^([A-Za-z]+)/);
          const type = m?.[1] ?? '';
          if (type === 'plural' || type === 'select' || type === 'selectordinal') kind = type;
          else kind = 'typed';
        }
        if (!found.has(name)) found.set(name, { name, kind });
      }
      i = j;
      continue;
    }
    i += 1;
  }
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

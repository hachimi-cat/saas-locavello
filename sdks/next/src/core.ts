import { IntlMessageFormat } from 'intl-messageformat';

/**
 * React-free core: catalog resolution + ICU formatting.
 *
 * Design rules (they are the product's Mode-A contract):
 * - `t()` NEVER returns empty/undefined — resolution ends at the key
 *   string itself, which in source-text-as-key mode IS the English copy.
 * - A formatting problem (bad values, malformed ICU) returns the raw
 *   message instead of throwing — a translation must never crash a page.
 * - Formatters are memoized per (locale, key).
 *
 * The key parameter is `string` here; the public entries (index.ts /
 * server.ts) re-export `createLocavello` narrowed to the
 * `RegisteredKeys` declaration-merging type so CLI-generated
 * `locavello.d.ts` files light up autocomplete + typo checking.
 */

/** locale → (catalog key → ICU message). */
export type Catalogs = Record<string, Record<string, string>>;

/** Values passed to ICU formatting. */
export type TValues = Record<string, unknown>;

export interface CreateLocavelloOptions {
  catalogs: Catalogs;
  /** The locale the source strings are written in (usually 'en'). */
  sourceLocale: string;
  /** locale → fallback locale, e.g. { 'pt-BR': 'pt', pt: 'es' }. */
  fallbacks?: Record<string, string | null | undefined>;
}

export type CoreTFunction = (key: string, values?: TValues) => string;

export interface CoreLocavello {
  getT: (locale: string) => CoreTFunction;
}

export function createLocavello(options: CreateLocavelloOptions): CoreLocavello {
  const { catalogs, sourceLocale } = options;
  const fallbacks = options.fallbacks ?? {};
  /** (locale \0 key) → memoized formatter; null = message failed to parse. */
  const formatters = new Map<string, IntlMessageFormat | null>();

  /**
   * Resolution order: active locale → fallback chain (cycle-guarded) →
   * sourceLocale → the key itself. Empty-string catalog entries are
   * treated as missing so they fall through instead of blanking UI.
   */
  function resolve(locale: string, key: string): string {
    const seen = new Set<string>();
    let current: string | null | undefined = locale;
    while (current && !seen.has(current)) {
      seen.add(current);
      const message: string | undefined = catalogs[current]?.[key];
      if (message !== undefined && message !== '') return message;
      current = fallbacks[current];
    }
    if (!seen.has(sourceLocale)) {
      const message = catalogs[sourceLocale]?.[key];
      if (message !== undefined && message !== '') return message;
    }
    return key;
  }

  function format(locale: string, key: string, message: string, values?: TValues): string {
    // Fast path: nothing ICU-relevant in the message. (Apostrophes go
    // through the formatter so ICU escaping — '' → ' — applies.)
    if (!message.includes('{') && !message.includes("'")) return message;
    const cacheKey = `${locale}\u0000${key}`;
    let mf = formatters.get(cacheKey);
    if (mf === undefined) {
      try {
        mf = new IntlMessageFormat(message, locale);
      } catch {
        mf = null; // malformed ICU — remembered, served raw
      }
      formatters.set(cacheKey, mf);
    }
    if (mf === null) return message;
    try {
      const out = mf.format(values ?? {});
      if (typeof out === 'string') return out;
      if (Array.isArray(out)) return out.map((part) => String(part)).join('');
      return String(out);
    } catch {
      // Formatting error (e.g. missing values) — fail open with the raw
      // message rather than throwing.
      return message;
    }
  }

  function getT(locale: string): CoreTFunction {
    return (key, values) => format(locale, key, resolve(locale, key), values);
  }

  return { getT };
}

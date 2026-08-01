import { createHash } from 'node:crypto';

/**
 * Catalog canonicalization + hashing. A Release is identified by the
 * content hash of its canonical JSON, which makes publishes idempotent
 * (same content → same release) and builds reproducible.
 */

/** Sort keys lexicographically and stringify without whitespace drift. */
export function canonicalCatalogJson(catalog: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(catalog).sort()) sorted[k] = catalog[k]!;
  return JSON.stringify(sorted);
}

export function catalogHash(catalog: Record<string, string>): string {
  return createHash('sha256').update(canonicalCatalogJson(catalog)).digest('hex');
}

/** Normalized source-text hash for exact-match TM lookups. */
export function tmSourceHash(sourceText: string): string {
  const normalized = sourceText.trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Namespaced catalog key: "namespace.name" for dotted keys, but a
 * source-text key in the default namespace stays bare so retrofit-mode
 * lookups are exactly `t('Create link')`.
 */
export function catalogKeyName(namespace: string, name: string): string {
  return namespace === 'default' ? name : `${namespace}.${name}`;
}

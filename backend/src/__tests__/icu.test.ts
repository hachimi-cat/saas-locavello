import { describe, expect, it } from 'vitest';
import {
  checkPlaceholders,
  countWords,
  estimateDisplayLength,
  extractPlaceholders,
} from '../lib/icu.js';
import { pseudoize } from '../lib/pseudo.js';
import { canonicalCatalogJson, catalogHash, catalogKeyName, tmSourceHash } from '../lib/catalog.js';

describe('extractPlaceholders', () => {
  it('finds simple placeholders', () => {
    expect(extractPlaceholders('Hello {name}!').map((p) => p.name)).toEqual(['name']);
  });

  it('finds typed and plural placeholders with kinds', () => {
    const ps = extractPlaceholders('{count, plural, one {# link} other {# links}} for {n, number}');
    expect(ps).toEqual([
      { name: 'count', kind: 'plural' },
      { name: 'n', kind: 'typed' },
    ]);
  });

  it('ignores quoted literals', () => {
    expect(extractPlaceholders("literal '{not_a_placeholder}' but {real}")).toEqual([
      { name: 'real', kind: 'simple' },
    ]);
  });

  it('treats doubled apostrophes as literal text, not quote toggles', () => {
    expect(extractPlaceholders("it''s {name}").map((p) => p.name)).toEqual(['name']);
  });

  it('dedupes repeated placeholders', () => {
    expect(extractPlaceholders('{a} and {a} and {b}').map((p) => p.name)).toEqual(['a', 'b']);
  });

  it('returns empty for plain text', () => {
    expect(extractPlaceholders('No placeholders here')).toEqual([]);
  });
});

describe('checkPlaceholders', () => {
  it('passes when names match exactly', () => {
    expect(checkPlaceholders('Hi {name}', 'Halo {name}')).toEqual({
      ok: true,
      missing: [],
      extra: [],
    });
  });

  it('rejects dropped placeholders', () => {
    const r = checkPlaceholders('Hi {name}, {count} items', 'Halo {name}');
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['count']);
  });

  it('rejects renamed placeholders as missing + extra', () => {
    const r = checkPlaceholders('Hi {name}', 'Halo {nama}');
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['name']);
    expect(r.extra).toEqual(['nama']);
  });

  it('order does not matter', () => {
    expect(checkPlaceholders('{a} {b}', '{b} {a}').ok).toBe(true);
  });
});

describe('estimateDisplayLength', () => {
  it('counts plain text length', () => {
    expect(estimateDisplayLength('Save')).toBe(4);
  });

  it('collapses ICU arguments to a nominal width', () => {
    // "{count, plural, one {# link} other {# links}}" → 6
    expect(estimateDisplayLength('{count, plural, one {# link} other {# links}}')).toBe(6);
    expect(estimateDisplayLength('X {n} Y')).toBe(2 + 6 + 2);
  });
});

describe('countWords', () => {
  it('counts words, ignoring ICU syntax', () => {
    expect(countWords('Save your changes')).toBe(3);
    expect(countWords('Hello {name}!')).toBe(2); // "Hello" + "!" token
    expect(countWords('')).toBe(0);
  });
});

describe('pseudoize', () => {
  it('accents, pads and brackets plain text', () => {
    const out = pseudoize('Save changes');
    expect(out.startsWith('[')).toBe(true);
    expect(out.endsWith(']')).toBe(true);
    expect(out).toContain('Ŝ');
    expect(out).toContain('~');
  });

  it('leaves placeholders intact so the message still formats', () => {
    const out = pseudoize('Hello {name}');
    expect(out).toContain('{name}');
  });

  it('keeps placeholder-safety with the source', () => {
    const out = pseudoize('Hi {name}, {count} items');
    expect(checkPlaceholders('Hi {name}, {count} items', out).ok).toBe(true);
  });
});

describe('catalog canonicalization', () => {
  it('is key-order independent', () => {
    expect(canonicalCatalogJson({ b: '2', a: '1' })).toBe(canonicalCatalogJson({ a: '1', b: '2' }));
    expect(catalogHash({ b: '2', a: '1' })).toBe(catalogHash({ a: '1', b: '2' }));
  });

  it('different content hashes differently', () => {
    expect(catalogHash({ a: '1' })).not.toBe(catalogHash({ a: '2' }));
  });

  it('tmSourceHash normalizes whitespace', () => {
    expect(tmSourceHash('  Save   changes ')).toBe(tmSourceHash('Save changes'));
    expect(tmSourceHash('Save changes')).not.toBe(tmSourceHash('save changes'));
  });

  it('catalogKeyName keeps default namespace bare', () => {
    expect(catalogKeyName('default', 'Create link')).toBe('Create link');
    expect(catalogKeyName('marketing', 'hero.title')).toBe('marketing.hero.title');
  });
});

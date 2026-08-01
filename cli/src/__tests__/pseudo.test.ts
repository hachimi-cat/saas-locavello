import { describe, expect, it } from 'vitest';
import { pseudoize, pseudoizeCatalog } from '../lib/pseudo.js';

describe('pseudoize', () => {
  it('accents, brackets, and pads plain text', () => {
    const out = pseudoize('Save changes');
    expect(out.startsWith('[')).toBe(true);
    expect(out.endsWith(']')).toBe(true);
    expect(out).toContain('Ŝàṽé çĥàñĝéŝ');
    // 11 letters → ceil(11 * 0.3) = 4 tildes.
    expect(out).toContain('~~~~');
  });

  it('keeps simple ICU placeholders byte-identical', () => {
    const out = pseudoize('Hello {name}, welcome back');
    expect(out).toContain('{name}');
    expect(out).not.toContain('{ñ');
  });

  it('keeps a full plural argument intact (round-trip safe)', () => {
    const icu = '{count, plural, one {# item} other {# items}}';
    const out = pseudoize(`You have ${icu} today`);
    expect(out).toContain(icu); // the whole argument passes through untouched
    expect(out).toContain('Ýöù ĥàṽé');
  });

  it("preserves ICU escaped apostrophes ('')", () => {
    const out = pseudoize("don''t {x}");
    expect(out).toContain("''");
    expect(out).toContain('{x}');
  });

  it('leaves quoted literals untouched', () => {
    const out = pseudoize("literal '{not a placeholder}' end");
    expect(out).toContain("'{not a placeholder}'");
  });

  it('pads proportionally to visible letters only', () => {
    // 'abcd' → 4 letters → ceil(1.2) = 2 tildes.
    expect(pseudoize('abcd')).toBe('[àƀçđ~~]');
  });
});

describe('pseudoizeCatalog', () => {
  it('maps every key and leaves key names untouched', () => {
    const out = pseudoizeCatalog({ 'marketing.hero.title': 'Ship it', Save: 'Save' });
    expect(Object.keys(out).sort()).toEqual(['Save', 'marketing.hero.title']);
    // 'Ship it' → 6 letters → ceil(1.8) = 2 tildes.
    expect(out['marketing.hero.title']).toBe('[Ŝĥìþ ìţ~~]');
  });
});

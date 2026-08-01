import { describe, expect, it } from 'vitest';
import { createLocavello } from '../core.js';

const catalogs = {
  en: {
    greet: 'Hello',
    'Create link': 'Create link',
    items: '{count, plural, one {# item} other {# items}}',
    'only.en': 'Only in English',
  },
  id: {
    greet: 'Halo',
    items: '{count, plural, other {# barang}}',
  },
  'id-formal': {
    greet: 'Selamat datang',
  },
};

describe('resolution order', () => {
  const { getT } = createLocavello({
    catalogs,
    sourceLocale: 'en',
    fallbacks: { 'id-formal': 'id' },
  });

  it('uses the active locale catalog first', () => {
    expect(getT('id-formal')('greet')).toBe('Selamat datang');
  });

  it('walks the fallback chain before the source locale', () => {
    expect(getT('id-formal')('items', { count: 2 })).toBe('2 barang');
  });

  it('falls back to the source locale when the chain misses', () => {
    expect(getT('id-formal')('only.en')).toBe('Only in English');
  });

  it('returns the key itself as the terminal fallback (source-text-as-key)', () => {
    expect(getT('id')('Save changes')).toBe('Save changes');
  });

  it('never returns empty or undefined', () => {
    const withEmpty = createLocavello({
      catalogs: { en: { blank: '' } },
      sourceLocale: 'en',
    });
    expect(withEmpty.getT('en')('blank')).toBe('blank'); // empty value = missing
    expect(withEmpty.getT('en')('totally.unknown')).toBe('totally.unknown');
  });

  it('survives a fallback cycle without hanging', () => {
    const cyclic = createLocavello({
      catalogs: { en: { x: 'from en' } },
      sourceLocale: 'en',
      fallbacks: { a: 'b', b: 'a' },
    });
    expect(cyclic.getT('a')('x')).toBe('from en');
    expect(cyclic.getT('a')('missing')).toBe('missing');
  });
});

describe('ICU formatting', () => {
  const { getT } = createLocavello({ catalogs, sourceLocale: 'en' });

  it('formats English plurals', () => {
    const t = getT('en');
    expect(t('items', { count: 1 })).toBe('1 item');
    expect(t('items', { count: 5 })).toBe('5 items');
  });

  it('formats Indonesian plurals with the id catalog', () => {
    const t = getT('id');
    expect(t('items', { count: 2 })).toBe('2 barang');
  });

  it('interpolates simple arguments', () => {
    const solo = createLocavello({
      catalogs: { en: { hi: 'Hi {name}!' } },
      sourceLocale: 'en',
    });
    expect(solo.getT('en')('hi', { name: 'bang' })).toBe('Hi bang!');
  });

  it('memoizes the formatter per (locale, key) — repeated calls agree', () => {
    const t = getT('en');
    expect(t('items', { count: 1 })).toBe(t('items', { count: 1 }));
    expect(t('items', { count: 3 })).toBe('3 items');
  });

  it("applies ICU apostrophe escaping ('' → ')", () => {
    const apo = createLocavello({
      catalogs: { en: { legal: "don''t {verb}" } },
      sourceLocale: 'en',
    });
    expect(apo.getT('en')('legal', { verb: 'panic' })).toBe("don't panic");
  });
});

describe('fail-open on formatting errors', () => {
  it('returns the raw message when required values are missing', () => {
    const { getT } = createLocavello({ catalogs, sourceLocale: 'en' });
    expect(getT('en')('items')).toBe('{count, plural, one {# item} other {# items}}');
  });

  it('returns the raw message for malformed ICU', () => {
    const broken = createLocavello({
      catalogs: { en: { bad: '{oops, plural' } },
      sourceLocale: 'en',
    });
    expect(broken.getT('en')('bad')).toBe('{oops, plural');
    // And stays consistent on repeat calls (parse failure is memoized).
    expect(broken.getT('en')('bad', { oops: 1 })).toBe('{oops, plural');
  });

  it('never throws for wildly wrong value types', () => {
    const { getT } = createLocavello({ catalogs, sourceLocale: 'en' });
    expect(() => getT('en')('items', { count: 'not-a-number' })).not.toThrow();
  });
});

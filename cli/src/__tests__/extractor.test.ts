import { describe, expect, it } from 'vitest';
import { mergeScans, scanSource, splitKey } from '../lib/extractor.js';

const scan = (src: string, fns: string[] = ['t']) => scanSource(src, 'src/app.tsx', fns);

describe('splitKey — the ns:key rule', () => {
  it('splits on an explicit colon with a valid namespace', () => {
    expect(splitKey('marketing:hero.title')).toEqual({ namespace: 'marketing', name: 'hero.title' });
  });

  it('does NOT split on dots — dotted strings stay in default', () => {
    expect(splitKey('marketing.hero.title')).toEqual({ namespace: 'default', name: 'marketing.hero.title' });
  });

  it('keeps prose with a colon in default (whitespace after colon)', () => {
    expect(splitKey('Error: {msg} happened')).toEqual({ namespace: 'default', name: 'Error: {msg} happened' });
  });

  it('keeps colon strings whose prefix is not a valid namespace', () => {
    expect(splitKey('Warning:overload')).toEqual({ namespace: 'default', name: 'Warning:overload' });
  });

  it('keeps a trailing-colon string in default', () => {
    expect(splitKey('note:')).toEqual({ namespace: 'default', name: 'note:' });
  });
});

describe('scanSource', () => {
  it('extracts single- and double-quoted literals', () => {
    const { keys, warnings } = scan(`const a = t('Create link'); const b = t("Delete link");`);
    expect(warnings).toEqual([]);
    expect(keys.map((k) => k.name).sort()).toEqual(['Create link', 'Delete link']);
    expect(keys.every((k) => k.namespace === 'default')).toBe(true);
  });

  it('handles escaped quotes inside literals', () => {
    const { keys } = scan(`t('it\\'s saved'); t("say \\"hi\\"")`);
    expect(keys.map((k) => k.name).sort()).toEqual([`it's saved`, `say "hi"`]);
  });

  it('interprets common escape sequences', () => {
    const { keys } = scan(`t('line one\\nline two')`);
    expect(keys[0]!.name).toBe('line one\nline two');
  });

  it('splits ns:key on colon', () => {
    const { keys } = scan(`t('marketing:hero.title')`);
    expect(keys).toEqual([{ namespace: 'marketing', name: 'hero.title', line: 1 }]);
  });

  it('does not split dotted keys without a colon', () => {
    const { keys } = scan(`t('marketing.hero.title')`);
    expect(keys).toEqual([{ namespace: 'default', name: 'marketing.hero.title', line: 1 }]);
  });

  it('warns on template literals with interpolation and skips them', () => {
    const { keys, warnings } = scan('t(`Hello ${name}`)');
    expect(keys).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('unextractable');
    expect(warnings[0]!.line).toBe(1);
  });

  it('extracts plain template literals without interpolation', () => {
    const { keys, warnings } = scan('t(`Plain template`)');
    expect(warnings).toEqual([]);
    expect(keys).toEqual([{ namespace: 'default', name: 'Plain template', line: 1 }]);
  });

  it('accepts a values argument after the key', () => {
    const { keys } = scan(`t('Hi {name}', { name: 'bang' })`);
    expect(keys).toEqual([{ namespace: 'default', name: 'Hi {name}', line: 1 }]);
  });

  it('warns and skips string concatenation', () => {
    const { keys, warnings } = scan(`t('prefix.' + id)`);
    expect(keys).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('key skipped');
  });

  it('ignores non-literal first arguments silently', () => {
    const { keys, warnings } = scan(`t(someVariable); t(fn())`);
    expect(keys).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('does not match longer identifiers ending in the function name', () => {
    const { keys } = scan(`format('x'); att('y'); not('z')`);
    expect(keys).toEqual([]);
  });

  it('matches method-style calls like i18n.t(…)', () => {
    const { keys } = scan(`i18n.t('From a method')`);
    expect(keys.map((k) => k.name)).toEqual(['From a method']);
  });

  it('respects the configured tFunctions', () => {
    const src = `tr('Via tr'); t('Via t')`;
    expect(scan(src, ['tr']).keys.map((k) => k.name)).toEqual(['Via tr']);
    expect(scan(src, ['t']).keys.map((k) => k.name)).toEqual(['Via t']);
  });

  it('reports correct line numbers', () => {
    const src = `const a = 1;\nconst b = t('First');\n\nexport const c =\n  t('Second');\n`;
    const { keys } = scan(src);
    expect(keys).toEqual([
      { namespace: 'default', name: 'First', line: 2 },
      { namespace: 'default', name: 'Second', line: 5 },
    ]);
  });

  it('tolerates whitespace between the function name and the literal', () => {
    const { keys } = scan(`t (\n  'Spaced out'\n)`);
    expect(keys.map((k) => k.name)).toEqual(['Spaced out']);
    expect(keys[0]!.line).toBe(2); // line of the literal itself
  });
});

describe('mergeScans', () => {
  it('deduplicates keys and accumulates usages across files', () => {
    const a = scanSource(`t('Shared'); t('OnlyA')`, 'src/a.ts', ['t']);
    const b = scanSource(`t('Shared')`, 'src/b.ts', ['t']);
    const merged = mergeScans([
      { file: 'src/a.ts', result: a },
      { file: 'src/b.ts', result: b },
    ]);
    const shared = merged.keys.find((k) => k.name === 'Shared');
    expect(shared?.usages).toEqual([
      { file: 'src/a.ts', line: 1 },
      { file: 'src/b.ts', line: 1 },
    ]);
    expect(merged.keys).toHaveLength(2);
  });
});

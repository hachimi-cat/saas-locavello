import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogKeyName, readCatalog, renderDts, stableCatalogJson, writeCatalog } from '../lib/files.js';

describe('stableCatalogJson', () => {
  it('sorts keys, indents with 2 spaces, ends with a newline', () => {
    const json = stableCatalogJson({ b: '2', a: '1' });
    expect(json).toBe('{\n  "a": "1",\n  "b": "2"\n}\n');
  });

  it('is stable — same input, same bytes', () => {
    const one = stableCatalogJson({ z: 'x', a: 'y', m: 'w' });
    const two = stableCatalogJson({ m: 'w', a: 'y', z: 'x' });
    expect(one).toBe(two);
  });
});

describe('writeCatalog / readCatalog', () => {
  it('round-trips through disk, creating parent dirs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locavello-cli-'));
    const file = path.join(dir, 'nested', 'en.json');
    writeCatalog(file, { 'Create link': 'Create link', 'marketing.hero.title': 'Ship it' });
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.indexOf('Create link')).toBeLessThan(raw.indexOf('marketing.hero.title'));
    expect(readCatalog(file)).toEqual({
      'Create link': 'Create link',
      'marketing.hero.title': 'Ship it',
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a missing file', () => {
    expect(readCatalog(path.join(os.tmpdir(), 'locavello-definitely-missing.json'))).toBeNull();
  });
});

describe('catalogKeyName', () => {
  it('keeps default-namespace keys bare and dots others', () => {
    expect(catalogKeyName('default', 'Create link')).toBe('Create link');
    expect(catalogKeyName('marketing', 'hero.title')).toBe('marketing.hero.title');
  });
});

describe('renderDts', () => {
  it('emits a sorted, deduped string-literal union + the module augmentation', () => {
    const dts = renderDts(['b.key', 'a.key', 'b.key']);
    expect(dts).toContain('export type LocavelloKey =\n  | "a.key"\n  | "b.key";');
    expect(dts).toContain("declare module '@forjio/locavello-next' {");
    expect(dts).toContain('interface RegisteredKeys {');
    expect(dts).toContain('keys: LocavelloKey;');
    expect(dts.endsWith('}\n')).toBe(true);
  });

  it('escapes quotes, backslashes, and newlines in key names', () => {
    const dts = renderDts(['it\'s "quoted"', 'back\\slash', 'line\nbreak']);
    expect(dts).toContain(String.raw`"it's \"quoted\""`);
    expect(dts).toContain(String.raw`"back\\slash"`);
    expect(dts).toContain(String.raw`"line\nbreak"`);
    // The emitted file must not contain a raw (unescaped) newline inside a literal.
    for (const line of dts.split('\n')) {
      const quoteCount = (line.match(/(?<!\\)"/g) ?? []).length;
      expect(quoteCount % 2).toBe(0);
    }
  });

  it('falls back to string when there are no keys', () => {
    const dts = renderDts([]);
    expect(dts).toContain('export type LocavelloKey = string;');
    expect(dts).toContain("declare module '@forjio/locavello-next'");
  });
});

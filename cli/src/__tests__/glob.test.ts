import { describe, expect, it } from 'vitest';
import { globToRegExp } from '../lib/glob.js';

describe('globToRegExp', () => {
  const re = globToRegExp('src/**/*.{ts,tsx}');

  it('matches files at any depth under src', () => {
    expect(re.test('src/app.ts')).toBe(true);
    expect(re.test('src/app.tsx')).toBe(true);
    expect(re.test('src/components/deep/button.tsx')).toBe(true);
  });

  it('rejects other extensions and other roots', () => {
    expect(re.test('src/styles.css')).toBe(false);
    expect(re.test('lib/app.ts')).toBe(false);
    expect(re.test('src/app.ts.bak')).toBe(false);
  });

  it('keeps * within a single path segment', () => {
    const single = globToRegExp('src/*.ts');
    expect(single.test('src/a.ts')).toBe(true);
    expect(single.test('src/nested/a.ts')).toBe(false);
  });

  it('escapes regex specials in literals', () => {
    const dotted = globToRegExp('a.b/c.ts');
    expect(dotted.test('a.b/c.ts')).toBe(true);
    expect(dotted.test('axb/c.ts')).toBe(false);
  });

  it('supports ? as a single non-separator character', () => {
    const q = globToRegExp('file?.ts');
    expect(q.test('file1.ts')).toBe(true);
    expect(q.test('file12.ts')).toBe(false);
    expect(q.test('file/.ts')).toBe(false);
  });
});

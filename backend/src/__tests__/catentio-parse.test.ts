import { describe, expect, it } from 'vitest';
import { parseTranslationOutput } from '../lib/catentio.js';

describe('parseTranslationOutput — lenient agent-output parsing', () => {
  it('parses the contract shape raw', () => {
    const out = parseTranslationOutput('{"translations":[{"id":"k1","value":"Buat tautan"}]}');
    expect(out).toEqual([{ id: 'k1', value: 'Buat tautan' }]);
  });

  it('parses fenced JSON with trailing prose (the observed drift)', () => {
    const observed = [
      '```json',
      '{',
      '  "sourceLocale": "en",',
      '  "items": [',
      '    {"id": "k1", "target": "Buat Link"},',
      '    {"id": "k2", "target": "{count, plural, other {# item}} dipilih"}',
      '  ]',
      '}',
      '```',
      '',
      '2 judgment calls worth flagging:',
      '- k1 uses the loanword.',
    ].join('\n');
    const out = parseTranslationOutput(observed);
    expect(out).toEqual([
      { id: 'k1', value: 'Buat Link' },
      { id: 'k2', value: '{count, plural, other {# item}} dipilih' },
    ]);
  });

  it('parses a bare object embedded in prose', () => {
    const out = parseTranslationOutput(
      'Here you go: {"translations":[{"id":"a","value":"x"}]} — done!',
    );
    expect(out).toEqual([{ id: 'a', value: 'x' }]);
  });

  it('returns empty on garbage', () => {
    expect(parseTranslationOutput('sorry, I cannot do that')).toEqual([]);
    expect(parseTranslationOutput('')).toEqual([]);
    expect(parseTranslationOutput('{"translations": "nope"}')).toEqual([]);
  });

  it('skips malformed rows but keeps good ones', () => {
    const out = parseTranslationOutput(
      '{"translations":[{"id":"a","value":"x"},{"value":"no-id"},{"id":"c"},{"id":"d","target":"via-target"}]}',
    );
    expect(out).toEqual([
      { id: 'a', value: 'x' },
      { id: 'd', value: 'via-target' },
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { LocavelloProvider, useT } from '../index.js';

/**
 * Context wiring test without @testing-library — renderToString drives
 * hooks + context exactly like an SSR pass, with zero extra deps.
 */

const catalogs = {
  en: { greet: 'Hello {name}', bye: 'Goodbye' },
  id: { greet: 'Halo {name}' },
};

function Greeting({ name }: { name: string }) {
  const t = useT();
  return createElement('span', null, t('greet', { name }));
}

function Bye() {
  const t = useT();
  return createElement('span', null, t('bye'));
}

describe('LocavelloProvider + useT', () => {
  afterEach(() => vi.restoreAllMocks());

  it('provides t through context', () => {
    const html = renderToString(
      createElement(
        LocavelloProvider,
        { locale: 'id', catalogs },
        createElement(Greeting, { name: 'bang' }),
      ),
    );
    expect(html).toContain('Halo bang');
  });

  it('falls back through the chain inside the provider', () => {
    const html = renderToString(
      createElement(LocavelloProvider, { locale: 'id', catalogs }, createElement(Bye)),
    );
    expect(html).toContain('Goodbye'); // id misses 'bye' → sourceLocale en
  });

  it('renders the key itself for unknown keys (never blank)', () => {
    function Unknown() {
      const t = useT();
      return createElement('span', null, t('not.in.any.catalog'));
    }
    const html = renderToString(
      createElement(LocavelloProvider, { locale: 'en', catalogs }, createElement(Unknown)),
    );
    expect(html).toContain('not.in.any.catalog');
  });

  it('fails open (key passthrough + warning) without a provider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const html = renderToString(createElement(Bye));
    expect(html).toContain('bye'); // the key renders as-is
    expect(warn).toHaveBeenCalled();
  });
});

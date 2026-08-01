'use client';

import { createContext, createElement, useContext, useMemo, type ReactNode } from 'react';
import { createLocavello, type Catalogs, type CoreTFunction } from './core.js';

/**
 * Client-side React wiring: `<LocavelloProvider>` + `useT()`.
 *
 * The `'use client'` directive makes this module a client boundary in
 * Next.js App Router builds; the react-free core stays importable from
 * server components via the package root or `/server` entry.
 */

const LocavelloContext = createContext<CoreTFunction | null>(null);

export interface LocavelloProviderProps {
  locale: string;
  catalogs: Catalogs;
  /** Defaults to 'en'. */
  sourceLocale?: string;
  fallbacks?: Record<string, string | null | undefined>;
  children?: ReactNode;
}

export function LocavelloProvider(props: LocavelloProviderProps) {
  const { locale, catalogs, sourceLocale = 'en', fallbacks, children } = props;
  const t = useMemo(
    () => createLocavello({ catalogs, sourceLocale, fallbacks }).getT(locale),
    [locale, catalogs, sourceLocale, fallbacks],
  );
  return createElement(LocavelloContext.Provider, { value: t }, children);
}

/** Fail-open t for a missing provider: keys render as themselves. */
const passthroughT: CoreTFunction = createLocavello({ catalogs: {}, sourceLocale: 'en' }).getT('en');
let warnedNoProvider = false;

export function useT(): CoreTFunction {
  const t = useContext(LocavelloContext);
  if (t) return t;
  if (!warnedNoProvider) {
    warnedNoProvider = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[locavello] useT() called outside <LocavelloProvider> — keys will render as-is (fail-open).',
    );
  }
  return passthroughT;
}

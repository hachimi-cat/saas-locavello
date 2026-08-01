import { createLocavello as createLocavelloCore } from './core.js';
import type { CreateLocavelloOptions } from './core.js';
import type { Locavello } from './index.js';

/**
 * Server/RSC entry — `@forjio/locavello-next/server`.
 *
 * Pure functions only: no React context, no client boundary — safe for
 * React Server Components and static-export builds. Create the instance
 * once in a shared module and call `getT(locale)` per request/page:
 *
 *   import { createLocavello } from '@forjio/locavello-next/server';
 *   const { getT } = createLocavello({ catalogs, sourceLocale: 'en' });
 *   const t = getT(locale);
 *
 * The type-only imports from './index.js' are erased at runtime, so
 * this module never loads the client-side code.
 */

export type { Catalogs, CreateLocavelloOptions, TValues } from './core.js';
export type { KeyOf, Locavello, RegisteredKeys, TFunction } from './index.js';

export const createLocavello: (options: CreateLocavelloOptions) => Locavello =
  createLocavelloCore;

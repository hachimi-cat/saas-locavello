import { createLocavello as createLocavelloCore } from './core.js';
import { useT as useTCore } from './client.js';
import type { CreateLocavelloOptions, TValues } from './core.js';

export type { Catalogs, CreateLocavelloOptions, TValues } from './core.js';
export { LocavelloProvider, type LocavelloProviderProps } from './client.js';

/**
 * Declaration-merging hook for typed keys. `locavello pull` emits a
 * `locavello.d.ts` in the customer repo:
 *
 *   export type LocavelloKey = 'Create link' | 'marketing.hero.title';
 *   declare module '@forjio/locavello-next' {
 *     interface RegisteredKeys { keys: LocavelloKey }
 *   }
 *
 * which narrows every `t()` key parameter to the project's real keys.
 * Without it, keys are plain strings — the SDK works untyped out of the
 * box. (The interface must live in THIS module — the augmentation
 * target — for the merge to apply; do not move it to core.ts.)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RegisteredKeys {}

export type KeyOf = RegisteredKeys extends { keys: infer K } ? K : string;

/** The translate function: catalog lookup + fallback chain + ICU. */
export type TFunction = (key: KeyOf & string, values?: TValues) => string;

export interface Locavello {
  getT: (locale: string) => TFunction;
}

/**
 * Build a Locavello instance from committed catalogs. Safe anywhere —
 * no React, no network, no runtime dependency on the Locavello service.
 * Narrowing cast is sound: the core accepts any string key.
 */
export const createLocavello: (options: CreateLocavelloOptions) => Locavello =
  createLocavelloCore;

/** Typed re-export of the client hook (see ./client.ts). */
export const useT: () => TFunction = useTCore;

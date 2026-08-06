import type { ChatAction } from '@forjio/agent-ui';
import { api } from '@/lib/api';

/**
 * The docked chat's Apply path (review mode) — executes a BFF-sanitized
 * ChatAction with the USER's own session via the same api-client calls
 * the dashboard pages use (the agent only ever proposed it).
 *
 * Glossary terms are flat and reference nothing, so there is no `$n`
 * cross-reference resolution here. Note what is absent: no branch for
 * translations, keys or releases — the engine cannot produce one (they
 * are not in the profile) and the auth layer would refuse it anyway.
 */

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v ? v : undefined;
/** Nullable pass-through: null clears, string sets, absent stays. A null
 *  `translation` with a null `locale` is the do-not-translate rule, so
 *  null must survive as null rather than collapsing to undefined. */
const strOrNull = (v: unknown): string | null | undefined =>
  v === null ? null : typeof v === 'string' ? v : undefined;

function defined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

export async function applyChatAction(
  action: ChatAction,
  // Unused: glossary terms reference nothing, so there is no `$n` to
  // resolve. Kept in the signature so the shared docked-chat call site
  // is identical across products.
  _earlier: { action: ChatAction; result?: unknown }[] = [],
): Promise<unknown> {
  const f = action.fields ?? {};

  if (action.resource === 'glossary') {
    const payload = defined({
      term: str(f.term),
      projectId: strOrNull(f.projectId),
      locale: strOrNull(f.locale),
      translation: strOrNull(f.translation),
      note: strOrNull(f.note),
    });
    if (action.mode === 'edit') {
      const id = str(action.id);
      if (!id) throw new Error('Missing glossary term id');
      return (await api.patch(`/glossary/${encodeURIComponent(id)}`, payload)).data;
    }
    if (!payload.term) throw new Error('A glossary entry needs a term');
    return (await api.post('/glossary', payload)).data;
  }

  throw new Error('This action type is not supported');
}

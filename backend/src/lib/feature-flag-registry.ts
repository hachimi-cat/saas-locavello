import { ensureFeatureFlag, isEnabled } from './feature-flags.js';

/**
 * Every feature flag this product owns, declared in ONE place and
 * registered at BOOT (src/index.ts).
 *
 * Registering from the admin route instead is the trap the rest of the
 * family fell into: the row then exists in no database until a human
 * opens /admin/feature-flags, and `isEnabled` fails closed on a missing
 * row — so a staged pilot flag gates nothing for exactly the accounts it
 * was allowlisted for. Locavello never had this file; it is created
 * here already wired the right way.
 */

/** Huudis subjects the catentio pilot is open to while it is off for
 *  everyone else. Emails work too — the allowlist is matched against
 *  both the usr_ id and the address, because staging Huudis mints
 *  different ids for the same person. */
const PILOT_SUBJECTS = [
  'usr_01KPHFKMCERET4RYTBPHKVK4ET', // adhya@forjio.com
  'usr_01KQXET0CV2A0ND610289DYEHA', // gojo@forjio.com
];

export const CATENTIO_PILOT_FLAG = 'catentio.pilot_integration';

/**
 * Declare every flag this product owns. Idempotent; safe to call on every
 * boot — it seeds enabled/rollout/allowlist on CREATE only, so a redeploy
 * never re-enables something turned off during an incident.
 */
export async function registerFeatureFlags(): Promise<void> {
  await ensureFeatureFlag({
    key: CATENTIO_PILOT_FLAG,
    label: 'Catentio pilot integration',
    description:
      "Embeds catentio's agentic chat bubble in this product. OFF for everyone; the allowlisted accounts get it anyway, which is how the pilot runs without shipping it to customers. Unrelated to the locavello-translator agent, which is a product feature and always on.",
    defaultEnabled: false,
    defaultAllowlist: PILOT_SUBJECTS,
  });
}

/** Is the catentio pilot on for this user? */
export async function catentioPilotEnabled(
  huudisUserId: string | null | undefined,
  email?: string | null,
): Promise<boolean> {
  if (await isEnabled(CATENTIO_PILOT_FLAG, huudisUserId ?? null)) return true;
  return !!email && isEnabled(CATENTIO_PILOT_FLAG, email);
}

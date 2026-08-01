import { prisma } from './db.js';
import { newId } from './ids.js';

/*
 * Identity roster — the thin SSO capture that gives the admin CRM real
 * identities (serront ea0babd port; the pawpado precedent: its local
 * users table doubles as an SSO roster feeding its CRM). Locavello
 * keeps NO local user table (stateless Huudis BFF), so CRM customers
 * synthesized from project rows only carried an opaque accountId —
 * `email: null, name: acc_…`. The roster closes that blind spot: every
 * sign-in and authenticated request upserts (huudisSub, email, name)
 * plus one membership row per accountId the user acts under.
 *
 * NOT an auth table — identity AUTHORITY stays in Huudis. These rows
 * are a display-only cache for accountId → best-known person.
 *
 * Write-throttled in-process: at most one DB upsert per
 * (sub, accountId) pair per hour, so requireAuth stays read-free on
 * the hot path and never gains a per-request write.
 */

const THROTTLE_MS = 60 * 60 * 1000; // 1h

/** (huudisSub|accountId) → last successful-write ms epoch. */
const lastWrite = new Map<string, number>();

/** Test hook — reset the in-process write throttle. */
export function clearRosterThrottle(): void {
  lastWrite.clear();
}

export interface IdentitySeen {
  huudisSub: string;
  email: string;
  name: string;
  /** accountIds the user is acting under / a member of. */
  accountIds: string[];
}

/** Upsert the roster for one sighting. Fire-and-forget safe: never
 *  throws — roster capture must never break auth or add latency. */
export async function recordIdentitySeen(seen: IdentitySeen): Promise<void> {
  const now = Date.now();
  const due = [...new Set(seen.accountIds)].filter((accountId) => {
    const last = lastWrite.get(`${seen.huudisSub}|${accountId}`);
    return !(last && now - last < THROTTLE_MS);
  });
  if (due.length === 0) return;
  // Mark before writing so concurrent requests don't double-write;
  // rolled back on failure so the next request retries.
  for (const accountId of due) lastWrite.set(`${seen.huudisSub}|${accountId}`, now);
  if (lastWrite.size > 10_000) lastWrite.clear(); // unbounded-growth guard
  try {
    const at = new Date();
    await prisma.rosterIdentity.upsert({
      where: { huudisSub: seen.huudisSub },
      create: {
        id: newId('rst'),
        huudisSub: seen.huudisSub,
        email: seen.email,
        name: seen.name,
        lastSeenAt: at,
      },
      update: { email: seen.email, name: seen.name, lastSeenAt: at },
    });
    for (const accountId of due) {
      await prisma.rosterMembership.upsert({
        where: { huudisSub_accountId: { huudisSub: seen.huudisSub, accountId } },
        create: { id: newId('rmb'), huudisSub: seen.huudisSub, accountId, lastSeenAt: at },
        update: { lastSeenAt: at },
      });
    }
  } catch (e) {
    for (const accountId of due) lastWrite.delete(`${seen.huudisSub}|${accountId}`);
    console.error('[identity-roster] upsert failed', e);
  }
}

/** accountId → best-known identity for the admin CRM join. Owner pick:
 *  the earliest-created member of that accountId (first person ever
 *  seen acting under it — for a personal acc_* that IS the owner; for
 *  a workspace it's the best available heuristic). */
export async function rosterOwnersByAccount(
  accountIds: string[],
): Promise<Map<string, { email: string; name: string }>> {
  const owners = new Map<string, { email: string; name: string }>();
  if (accountIds.length === 0) return owners;
  const members = await prisma.rosterMembership.findMany({
    where: { accountId: { in: accountIds } },
    orderBy: { createdAt: 'asc' },
    include: { identity: { select: { email: true, name: true } } },
  });
  for (const m of members) {
    if (!owners.has(m.accountId)) {
      owners.set(m.accountId, { email: m.identity.email, name: m.identity.name });
    }
  }
  return owners;
}

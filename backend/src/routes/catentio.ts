import type { Request } from 'express';
import { createCatentioRouter, type CatentioEmbedUser } from '@forjio/catentio-embed';
import { requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { catentioPilotEnabled } from '../lib/feature-flag-registry.js';
import { resolveTier } from '../lib/billing.js';
import {
  LOCAVELLO_DELEGATION_PREFIX,
  LOCAVELLO_PROFILE,
  type LocavelloLimits,
} from '../lib/catentio-profile.js';

/**
 * The catentio BFF — locavello's consumption of @forjio/catentio-embed.
 *
 * Locavello is the only product that talked to catentio BEFORE this
 * layer: `lib/catentio.ts` dispatches the `locavello-translator` agent
 * as the machine-translation provider. That stays exactly as it was.
 * This adds a SECOND agent — the embedded assistant, `locavello` —
 * behind the pilot flag. Both dispatch with the same CATENTIO_API_KEY
 * because both agent rows are owned by the same catentio customer, and
 * the agent slug is what distinguishes them (the package defaults it to
 * `product`, and locavello sets LOCAVELLO_AGENT_SLUG rather than
 * CATENTIO_AGENT_SLUG, so the two cannot collide).
 */

/** Locavello tier → the CP's plan-grant tier. */
function grantPlan(tier: string): string {
  if (tier === 'free') return 'FREE';
  if (tier === 'business' || tier === 'scale') return 'BUSINESS';
  return 'PRO';
}

async function resolveUser(req: Request): Promise<CatentioEmbedUser | null> {
  const auth = req.auth as
    | { sub?: string; accountId?: string; email?: string; name?: string }
    | undefined;
  // API-key auth stamps `api_key:` subs — the assistant is per-user (the
  // flag allowlist holds usr_… ids) and acts as a person, never as a
  // workspace credential.
  if (!auth?.sub || !auth.accountId || auth.sub.startsWith('api_key:')) return null;
  return {
    sub: auth.sub,
    email: auth.email ?? '',
    name: auth.name ?? '',
    workspaceId: auth.accountId,
    plan: grantPlan(await resolveTier(prisma, auth.accountId)),
  };
}

const embed = createCatentioRouter<LocavelloLimits>({
  product: 'locavello',
  profile: LOCAVELLO_PROFILE,
  knownApiBases: ['https://locavello.forjio.com', 'https://staging-locavello.forjio.com'],
  authenticate: requireAuth,
  getUser: resolveUser,
  flagEnabled: (u) => catentioPilotEnabled(u.sub, u.email),
  envelope: {
    ok: (res, data) => sendOk(res, (res as any).req, data),
    err: (res, e) => sendErr(res, (res as any).req, e.status, e.code, e.message),
  },
  settings: {
    async getAutoApply(accountId) {
      const row = await prisma.assistantSettings.findUnique({ where: { accountId } });
      return row?.autoApply !== false;
    },
    async setAutoApply(accountId, autoApply) {
      await prisma.assistantSettings.upsert({
        where: { accountId },
        create: { accountId, autoApply },
        update: { autoApply },
      });
    },
  },
  async planLimits(u) {
    return { plan: await resolveTier(prisma, u.workspaceId) };
  },
  // Locavello keeps no local roles (membership is Huudis-side); any
  // signed-in member of the workspace may flip the assistant setting.
  canWriteSettings: () => true,
  delegationPrefix: LOCAVELLO_DELEGATION_PREFIX,
});

export const clearCatentioGateState = embed.clearGateState;
export default embed.router;

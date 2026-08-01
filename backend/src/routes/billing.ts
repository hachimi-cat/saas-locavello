import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h } from '../lib/async-handler.js';
import { getPlugipayClient, hostedCheckoutUrl, plugipayConfigured } from '../lib/plugipay.js';
import {
  TIER_DEFS,
  agentWordBudget,
  isPaidTier,
  tierDef,
  type BillingTier,
} from '../lib/billing.js';

/*
 * /api/v1/billing — workspace plan + Plugipay checkout (behind the
 * engine auth; accountId from the session/API key).
 *
 * Early access: purchases are real and recorded truthfully. Feature
 * limits are displayed live, not enforced. The agent-word budget IS
 * enforced (it spends real money) and is returned here so the billing
 * page can render "X of Y words used".
 */

const router = Router();

const PUBLIC_URL = () => process.env.APP_URL ?? 'https://locavello.forjio.com';

router.get(
  '/',
  h(async (req, res) => {
    const accountId = req.auth!.accountId as string;
    const [sub, budget, projects] = await Promise.all([
      prisma.billingSubscription.findUnique({ where: { accountId } }),
      agentWordBudget(prisma, accountId),
      prisma.project.count({ where: { accountId } }),
    ]);
    sendOk(res, req, {
      subscription: sub ?? {
        id: null,
        accountId,
        tier: 'free' as BillingTier,
        status: 'active',
        plugipayCheckoutSessionId: null,
        currentPeriodEnd: null,
      },
      earlyAccess: true,
      usage: {
        projects,
        agentWords: { used: budget.used, limit: budget.limit },
      },
      tiers: TIER_DEFS,
    });
  }),
);

const checkoutBody = z.object({
  tier: z.enum(['free', 'starter', 'pro', 'scale']),
});

router.post(
  '/checkout',
  h(async (req, res) => {
    const { tier } = checkoutBody.parse(req.body ?? {});
    if (!isPaidTier(tier)) {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'this tier has no self-serve checkout', {
        param: 'tier',
      });
    }
    if (!plugipayConfigured()) {
      return sendErr(res, req, 503, 'NOT_CONFIGURED', 'Plugipay billing is not configured');
    }

    const accountId = req.auth!.accountId as string;
    const def = tierDef(tier);
    const client = getPlugipayClient();
    const session = await client.checkoutSessions.create({
      amount: def.priceIdr,
      currency: 'IDR',
      methods: ['qris', 'va', 'ewallet', 'card'],
      successUrl: `${PUBLIC_URL()}/dashboard/billing?status=success`,
      cancelUrl: `${PUBLIC_URL()}/dashboard/billing?status=canceled`,
      lineItems: [
        {
          name: `Locavello ${def.name} — Rp ${def.priceIdr.toLocaleString('id-ID')}/mo`,
          quantity: 1,
          unitAmount: def.priceIdr,
        },
      ],
      metadata: { accountId, tier },
    });

    sendOk(res, req, {
      checkoutSessionId: session.id,
      hostedUrl: hostedCheckoutUrl(session),
    });
  }),
);

export default router;

import type { Prisma } from '@prisma/client';
import { newId } from './ids.js';
import { writeOutbox } from './outbox.js';

/*
 * Billing domain — tier definitions + the webhook apply step + the
 * agent-word wallet guard.
 *
 * The tier table is THE machine-readable source the pricing page and
 * comparison table mirror (three mirrors stay in sync; the billing
 * dashboard reads this via the API, never a fourth copy).
 *
 * Early access: purchases are real and recorded truthfully. Feature
 * limits (projects/locales/keys) are DISPLAYED but not enforced — the
 * early-access banner covers that. AGENT WORDS ARE ENFORCED FOR REAL
 * even in early access: they spend actual LLM money per run, so the
 * Free tier's 1,000-word one-off trial and the paid monthly caps are
 * hard gates from day one.
 */

export const BILLING_TIERS = ['free', 'starter', 'pro', 'scale'] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

export interface TierDef {
  id: BillingTier;
  name: string;
  /** Whole rupiah per month. 0 = free; -1 = contact us. */
  priceIdr: number;
  blurb: string;
  /** -1 = unlimited. */
  projectLimit: number;
  localesPerProject: number;
  keysPerProject: number;
  /** Agent-translated words per month; for free this is a ONE-OFF
   *  lifetime trial, not monthly. -1 = negotiated. */
  agentWordsPerMonth: number;
  features: string[];
}

export const TIER_DEFS: readonly TierDef[] = [
  {
    id: 'free',
    name: 'Free',
    priceIdr: 0,
    projectLimit: 1,
    localesPerProject: 2,
    keysPerProject: 200,
    agentWordsPerMonth: 1_000,
    blurb: 'A real small site, shipped in a second language.',
    features: [
      '1 project · 2 locales · 200 keys',
      'CLI + Next.js SDK + typed keys',
      'Pseudo-locale (en-XA) + CI check gate',
      'Fallback chains — never a blank string',
      '1,000 agent-translated words (one-off trial)',
      'Community support',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceIdr: 90_000,
    projectLimit: 3,
    localesPerProject: 5,
    keysPerProject: 2_000,
    agentWordsPerMonth: 50_000,
    blurb: 'For a product that is serious about its second market.',
    features: [
      '3 projects · 5 locales · 2,000 keys each',
      'Everything in Free',
      'Review queue + gated namespaces',
      'Glossary + translation memory',
      'Website translation (Mode B) on 1 site',
      '50,000 agent words / month',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceIdr: 290_000,
    projectLimit: 10,
    localesPerProject: -1,
    keysPerProject: 20_000,
    agentWordsPerMonth: 250_000,
    blurb: 'For teams shipping many products in many languages.',
    features: [
      '10 projects · unlimited locales · 20,000 keys each',
      'Everything in Starter',
      'Releases with diff + rollback',
      'Roles: owner / developer / translator / reviewer',
      'Website translation on unlimited sites',
      '250,000 agent words / month',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    priceIdr: -1,
    projectLimit: -1,
    localesPerProject: -1,
    keysPerProject: -1,
    agentWordsPerMonth: -1,
    blurb: 'For the 13-products-in-20-languages shape.',
    features: [
      'Unlimited everything',
      'Negotiated agent volume',
      'SSO + SLA',
      'Custom agent tone + glossary curation',
    ],
  },
];

export function isBillingTier(v: unknown): v is BillingTier {
  return typeof v === 'string' && (BILLING_TIERS as readonly string[]).includes(v);
}

export function tierDef(tier: BillingTier): TierDef {
  return TIER_DEFS.find((t) => t.id === tier)!;
}

export function isPaidTier(tier: BillingTier): boolean {
  return tierDef(tier).priceIdr > 0;
}

export function parseCheckoutMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { accountId: string; tier: BillingTier } | null {
  const md = metadata ?? {};
  const accountId = typeof md.accountId === 'string' ? md.accountId.trim() : '';
  const tier = md.tier;
  if (!accountId || !isBillingTier(tier) || !isPaidTier(tier)) return null;
  return { accountId, tier };
}

export const PERIOD_DAYS = 30;

export interface BillingDb {
  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}

/** Webhook apply step for plugipay.checkout_session.completed.v1 —
 *  idempotent on the checkout session id (Plugipay retries). */
export async function applyCheckoutCompleted(
  db: BillingDb,
  input: { sessionId: string; accountId: string; tier: BillingTier },
): Promise<'applied' | 'duplicate'> {
  return db.$transaction(async (tx) => {
    const dup = await tx.billingSubscription.findFirst({
      where: { plugipayCheckoutSessionId: input.sessionId },
      select: { id: true },
    });
    if (dup) return 'duplicate' as const;

    const currentPeriodEnd = new Date(Date.now() + PERIOD_DAYS * 24 * 60 * 60 * 1000);
    const sub = await tx.billingSubscription.upsert({
      where: { accountId: input.accountId },
      create: {
        id: newId('bsub'),
        accountId: input.accountId,
        tier: input.tier,
        status: 'active',
        plugipayCheckoutSessionId: input.sessionId,
        currentPeriodEnd,
      },
      update: {
        tier: input.tier,
        status: 'active',
        plugipayCheckoutSessionId: input.sessionId,
        currentPeriodEnd,
      },
    });
    await writeOutbox(tx, {
      type: 'locavello.billing.subscribed.v1',
      accountId: input.accountId,
      aggregateId: sub.id,
      data: {
        subscriptionId: sub.id,
        tier: input.tier,
        plugipayCheckoutSessionId: input.sessionId,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
      },
    });
    return 'applied' as const;
  });
}

// ── Agent-word wallet guard (ENFORCED, even in early access) ────────

export interface UsageDb {
  billingSubscription: {
    findUnique(args: {
      where: { accountId: string };
    }): Promise<{ tier: string; status: string; currentPeriodEnd: Date | null } | null>;
  };
  agentUsage: {
    aggregate(args: {
      where: { accountId: string; createdAt?: { gte: Date } };
      _sum: { words: true };
    }): Promise<{ _sum: { words: number | null } }>;
  };
}

export async function resolveTier(db: UsageDb, accountId: string): Promise<BillingTier> {
  const sub = await db.billingSubscription.findUnique({ where: { accountId } });
  if (!sub || sub.status === 'canceled') return 'free';
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < Date.now()) return 'free';
  return isBillingTier(sub.tier) ? sub.tier : 'free';
}

export interface WordBudget {
  tier: BillingTier;
  limit: number; // -1 = unlimited
  used: number;
  remaining: number; // Infinity when unlimited
}

/** Free = lifetime (one-off trial); paid = calendar month to date. */
export async function agentWordBudget(db: UsageDb, accountId: string): Promise<WordBudget> {
  const tier = await resolveTier(db, accountId);
  const def = tierDef(tier);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const agg = await db.agentUsage.aggregate({
    where: {
      accountId,
      ...(tier === 'free' ? {} : { createdAt: { gte: monthStart } }),
    },
    _sum: { words: true },
  });
  const used = agg._sum.words ?? 0;
  const limit = def.agentWordsPerMonth;
  return {
    tier,
    limit,
    used,
    remaining: limit < 0 ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
  };
}

import { describe, expect, it } from 'vitest';
import {
  agentWordBudget,
  applyCheckoutCompleted,
  parseCheckoutMetadata,
  resolveTier,
  tierDef,
  type BillingDb,
  type UsageDb,
} from '../lib/billing.js';

describe('parseCheckoutMetadata', () => {
  it('accepts paid tiers with an account', () => {
    expect(parseCheckoutMetadata({ accountId: 'acc_x', tier: 'starter' })).toEqual({
      accountId: 'acc_x',
      tier: 'starter',
    });
  });
  it('rejects free, scale-without-price, junk and missing fields', () => {
    expect(parseCheckoutMetadata({ accountId: 'acc_x', tier: 'free' })).toBeNull();
    expect(parseCheckoutMetadata({ accountId: 'acc_x', tier: 'scale' })).toBeNull();
    expect(parseCheckoutMetadata({ accountId: '', tier: 'pro' })).toBeNull();
    expect(parseCheckoutMetadata({ tier: 'pro' })).toBeNull();
    expect(parseCheckoutMetadata(null)).toBeNull();
  });
});

function fakeBillingDb() {
  const subs = new Map<string, Record<string, unknown>>();
  const outbox: unknown[] = [];
  const tx = {
    billingSubscription: {
      findFirst: async ({ where }: { where: { plugipayCheckoutSessionId: string } }) => {
        for (const s of subs.values()) {
          if (s.plugipayCheckoutSessionId === where.plugipayCheckoutSessionId) return { id: s.id };
        }
        return null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { accountId: string };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const existing = subs.get(where.accountId);
        const row = existing ? { ...existing, ...update } : { ...create };
        subs.set(where.accountId, row);
        return row;
      },
    },
    outboxEvent: {
      create: async ({ data }: { data: unknown }) => {
        outbox.push(data);
        return data;
      },
    },
  };
  const db: BillingDb = {
    $transaction: async (fn) => fn(tx as never),
  };
  return { db, subs, outbox };
}

describe('applyCheckoutCompleted', () => {
  it('applies once and dedupes on the session id', async () => {
    const { db, subs, outbox } = fakeBillingDb();
    const input = { sessionId: 'cs_1', accountId: 'acc_a', tier: 'pro' as const };
    expect(await applyCheckoutCompleted(db, input)).toBe('applied');
    expect(await applyCheckoutCompleted(db, input)).toBe('duplicate');
    expect(subs.get('acc_a')?.tier).toBe('pro');
    expect(outbox).toHaveLength(1);
  });
});

function usageDb(opts: {
  tier?: string | null;
  status?: string;
  periodEnd?: Date | null;
  words: number;
}): UsageDb {
  return {
    billingSubscription: {
      findUnique: async () =>
        opts.tier == null
          ? null
          : {
              tier: opts.tier,
              status: opts.status ?? 'active',
              currentPeriodEnd: opts.periodEnd ?? new Date(Date.now() + 86_400_000),
            },
    },
    agentUsage: {
      aggregate: async () => ({ _sum: { words: opts.words } }),
    },
  };
}

describe('resolveTier + agentWordBudget — the enforced wallet guard', () => {
  it('no row = free; expired or canceled = free', async () => {
    expect(await resolveTier(usageDb({ tier: null, words: 0 }), 'a')).toBe('free');
    expect(
      await resolveTier(usageDb({ tier: 'pro', status: 'canceled', words: 0 }), 'a'),
    ).toBe('free');
    expect(
      await resolveTier(
        usageDb({ tier: 'pro', periodEnd: new Date(Date.now() - 1000), words: 0 }),
        'a',
      ),
    ).toBe('free');
  });

  it('free trial is a lifetime budget of 1000 words', async () => {
    const b = await agentWordBudget(usageDb({ tier: null, words: 400 }), 'a');
    expect(b.tier).toBe('free');
    expect(b.limit).toBe(1_000);
    expect(b.remaining).toBe(600);
  });

  it('paid tiers budget per month and never go negative', async () => {
    const b = await agentWordBudget(usageDb({ tier: 'starter', words: 60_000 }), 'a');
    expect(b.limit).toBe(50_000);
    expect(b.remaining).toBe(0);
  });

  it('scale is unlimited', async () => {
    const b = await agentWordBudget(usageDb({ tier: 'scale', words: 10_000_000 }), 'a');
    expect(b.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('tier table stays self-consistent', () => {
    expect(tierDef('free').agentWordsPerMonth).toBe(1_000);
    expect(tierDef('starter').priceIdr).toBe(90_000);
    expect(tierDef('pro').priceIdr).toBe(290_000);
    expect(tierDef('scale').priceIdr).toBe(-1);
  });
});

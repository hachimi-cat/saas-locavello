import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'node:crypto';

/*
 * Identity roster — the thin SSO capture closing the admin-CRM blind
 * spot (customers showed `email: null, name: acc_…` because this
 * stateless-Huudis product keeps no local identity). Serront ea0babd
 * port. Covers:
 *
 *   1. requireAuth (BFF Path 0) upserts identity + ACTIVE-account
 *      membership, throttled to ≤1 write per (sub, account) per hour.
 *   2. The workspace-override cookie captures membership for the
 *      workspace actually acted under (multi-workspace).
 *   3. auth-config's `onAuthenticated` login hook records the personal
 *      derived accountId + the login-time workspace snapshot, and
 *      skips admin sessions.
 *   4. admin-crm /customers is roster-driven (one row per identity,
 *      workspaces + project counts) and falls back to accountId-only
 *      rows for project workspaces nobody has been seen under.
 */

vi.mock('../lib/db.js', () => ({
  prisma: {
    rosterIdentity: { upsert: vi.fn(), findMany: vi.fn() },
    rosterMembership: { upsert: vi.fn(), findMany: vi.fn() },
    project: { groupBy: vi.fn(), count: vi.fn() },
    key: { count: vi.fn() },
    agentUsage: { aggregate: vi.fn() },
    billingSubscription: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../lib/db.js';
import { requireAuth } from '../middleware/auth.js';
import { authConfig } from '../auth-config.js';
import { clearRosterThrottle } from '../lib/identity-roster.js';
import adminCrmRouter from '../routes/admin-crm.js';

const db = prisma as unknown as {
  rosterIdentity: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  rosterMembership: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  project: { groupBy: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  key: { count: ReturnType<typeof vi.fn> };
  agentUsage: { aggregate: ReturnType<typeof vi.fn> };
  billingSubscription: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

const SESSION_COOKIE = 'locavello_session';
const OVERRIDE_COOKIE = 'locavello_active_workspace';

function mintSession(overrides: Record<string, unknown> = {}): string {
  return authConfig.codec.encode({
    accountId: 'acc_personal',
    email: 'merchant@example.com',
    name: 'Test Merchant',
    huudisSub: 'huudis|u1',
    role: 'merchant',
    accountIds: ['acc_personal', 'wks_team'],
    ...overrides,
  });
}

function makeApp() {
  const app = express();
  app.get('/whoami', requireAuth, (req, res) => {
    res.json({ accountId: req.auth?.accountId });
  });
  return app;
}

/** Drain the fire-and-forget roster write (a few microtask/IO ticks). */
async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
}

beforeEach(() => {
  clearRosterThrottle();
  db.rosterIdentity.upsert.mockReset().mockResolvedValue({});
  db.rosterIdentity.findMany.mockReset().mockResolvedValue([]);
  db.rosterMembership.upsert.mockReset().mockResolvedValue({});
  db.rosterMembership.findMany.mockReset().mockResolvedValue([]);
  db.project.groupBy.mockReset().mockResolvedValue([]);
  db.project.count.mockReset().mockResolvedValue(0);
  db.key.count.mockReset().mockResolvedValue(0);
  db.agentUsage.aggregate.mockReset().mockResolvedValue({ _sum: { words: 0 } });
  db.billingSubscription.findMany.mockReset().mockResolvedValue([]);
  db.billingSubscription.count.mockReset().mockResolvedValue(0);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('identity roster — capture in requireAuth (BFF Path 0)', () => {
  it('upserts identity + membership for the active account', async () => {
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}`);
    expect(res.status).toBe(200);
    await flush();

    expect(db.rosterIdentity.upsert).toHaveBeenCalledTimes(1);
    const idArgs = db.rosterIdentity.upsert.mock.calls[0]![0];
    expect(idArgs.where).toEqual({ huudisSub: 'huudis|u1' });
    expect(idArgs.create.email).toBe('merchant@example.com');
    expect(idArgs.create.name).toBe('Test Merchant');
    expect(idArgs.create.id).toMatch(/^rst_/);
    expect(idArgs.update.email).toBe('merchant@example.com');

    expect(db.rosterMembership.upsert).toHaveBeenCalledTimes(1);
    const mArgs = db.rosterMembership.upsert.mock.calls[0]![0];
    expect(mArgs.where).toEqual({
      huudisSub_accountId: { huudisSub: 'huudis|u1', accountId: 'acc_personal' },
    });
    expect(mArgs.create.id).toMatch(/^rmb_/);
  });

  it('throttles: a second request within the hour writes nothing', async () => {
    const app = makeApp();
    const cookie = `${SESSION_COOKIE}=${mintSession()}`;
    await request(app).get('/whoami').set('Cookie', cookie);
    await flush();
    expect(db.rosterIdentity.upsert).toHaveBeenCalledTimes(1);

    await request(app).get('/whoami').set('Cookie', cookie);
    await flush();
    expect(db.rosterIdentity.upsert).toHaveBeenCalledTimes(1);
    expect(db.rosterMembership.upsert).toHaveBeenCalledTimes(1);
  });

  it('a failed write clears the throttle so the next request retries', async () => {
    const app = makeApp();
    const cookie = `${SESSION_COOKIE}=${mintSession()}`;
    db.rosterIdentity.upsert.mockRejectedValueOnce(new Error('db down'));
    await request(app).get('/whoami').set('Cookie', cookie);
    await flush();
    expect(db.rosterMembership.upsert).not.toHaveBeenCalled();

    await request(app).get('/whoami').set('Cookie', cookie);
    await flush();
    expect(db.rosterIdentity.upsert).toHaveBeenCalledTimes(2);
    expect(db.rosterMembership.upsert).toHaveBeenCalledTimes(1);
  });

  it('captures the ACTIVE workspace when the override cookie is set (multi-workspace)', async () => {
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}; ${OVERRIDE_COOKIE}=wks_team`);
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe('wks_team');
    await flush();

    const mArgs = db.rosterMembership.upsert.mock.calls[0]![0];
    expect(mArgs.where.huudisSub_accountId.accountId).toBe('wks_team');
  });

  it('a roster DB failure never breaks the request', async () => {
    db.rosterIdentity.upsert.mockRejectedValue(new Error('db down'));
    const res = await request(makeApp())
      .get('/whoami')
      .set('Cookie', `${SESSION_COOKIE}=${mintSession()}`);
    expect(res.status).toBe(200);
    await flush();
  });
});

describe('identity roster — onAuthenticated login hook', () => {
  const hookCtx = {
    account: { id: 'huudis|u9', email: 'owner@example.com', name: 'Owner' },
    tokens: { access_token: 'at', refresh_token: 'rt' },
    accountIds: ['wks_alpha', 'wks_beta'],
    via: 'password' as const,
  };

  it('records the derived personal accountId + the workspace snapshot', async () => {
    await authConfig.onAuthenticated!({ ...hookCtx, role: 'merchant' });
    await flush();

    expect(db.rosterIdentity.upsert).toHaveBeenCalledTimes(1);
    expect(db.rosterIdentity.upsert.mock.calls[0]![0].where).toEqual({ huudisSub: 'huudis|u9' });

    const derived = `acc_${crypto.createHash('sha256').update('huudis|u9').digest('hex').slice(0, 24)}`;
    const seen = db.rosterMembership.upsert.mock.calls.map(
      (c) =>
        (c[0] as { where: { huudisSub_accountId: { accountId: string } } }).where
          .huudisSub_accountId.accountId,
    );
    expect(seen).toEqual([derived, 'wks_alpha', 'wks_beta']);
  });

  it('skips admin sessions — they are not CRM customers', async () => {
    await authConfig.onAuthenticated!({ ...hookCtx, role: 'admin' });
    await flush();
    expect(db.rosterIdentity.upsert).not.toHaveBeenCalled();
    expect(db.rosterMembership.upsert).not.toHaveBeenCalled();
  });
});

describe('identity roster — admin CRM /customers (roster-driven + fallback)', () => {
  function crmApp() {
    const app = express();
    app.use('/admin/crm', adminCrmRouter);
    return app;
  }

  it('one row per identity with workspaces + project counts; accountId-only fallback rows', async () => {
    const recent = new Date(); // within the 30d active window
    const stale = new Date('2026-01-01');
    db.rosterIdentity.findMany.mockResolvedValue([
      {
        id: 'rst_1',
        huudisSub: 'huudis|u1',
        email: 'owner@example.com',
        name: 'Owner',
        createdAt: new Date('2026-06-01'),
        lastSeenAt: recent,
      },
      {
        id: 'rst_2',
        huudisSub: 'huudis|u2',
        email: 'quiet@example.com',
        name: 'Quiet',
        createdAt: new Date('2026-06-02'),
        lastSeenAt: stale,
      },
    ]);
    db.rosterMembership.findMany.mockResolvedValue([
      { huudisSub: 'huudis|u1', accountId: 'acc_personal', createdAt: new Date('2026-06-01') },
      { huudisSub: 'huudis|u1', accountId: 'wks_team', createdAt: new Date('2026-06-03') },
      { huudisSub: 'huudis|u2', accountId: 'wks_empty', createdAt: new Date('2026-06-02') },
    ]);
    db.project.groupBy.mockResolvedValue([
      {
        accountId: 'acc_personal',
        _count: { _all: 2 },
        _min: { createdAt: new Date('2026-06-01') },
        _max: { updatedAt: recent },
      },
      {
        accountId: 'wks_team',
        _count: { _all: 1 },
        _min: { createdAt: new Date('2026-06-04') },
        _max: { updatedAt: recent },
      },
      {
        // Nobody in the roster has been seen under this workspace —
        // must surface as an accountId-only fallback row.
        accountId: 'acc_prehistoric',
        _count: { _all: 3 },
        _min: { createdAt: new Date('2026-05-01') },
        _max: { updatedAt: stale },
      },
    ]);

    const res = await request(crmApp()).get('/admin/crm/customers');
    expect(res.status).toBe(200);
    const customers = res.body.data.customers as Array<{
      id: string;
      email: string | null;
      name: string;
      status: string;
      workspaces: string[];
      projectCount: number;
    }>;
    expect(customers).toHaveLength(3);

    const owner = customers.find((c) => c.id === 'huudis|u1')!;
    expect(owner.email).toBe('owner@example.com');
    expect(owner.name).toBe('Owner');
    expect(owner.workspaces).toEqual(['acc_personal', 'wks_team']);
    expect(owner.projectCount).toBe(3); // 2 + 1 across their workspaces
    expect(owner.status).toBe('active');

    const quiet = customers.find((c) => c.id === 'huudis|u2')!;
    expect(quiet.projectCount).toBe(0); // member of a project-less workspace
    expect(quiet.status).toBe('quiet');

    const fallback = customers.find((c) => c.id === 'acc_prehistoric')!;
    expect(fallback.email).toBeNull();
    expect(fallback.name).toBe('acc_prehistoric');
    expect(fallback.projectCount).toBe(3);
    expect(fallback.workspaces).toEqual(['acc_prehistoric']);
  });

  it('transactions joins the roster for the customer column and reports tier detail', async () => {
    db.billingSubscription.findMany.mockResolvedValue([
      {
        id: 'bsub_1',
        accountId: 'wks_team',
        tier: 'pro',
        status: 'active',
        currentPeriodEnd: new Date('2026-08-31'),
        createdAt: new Date('2026-07-01'),
      },
      {
        id: 'bsub_2',
        accountId: 'acc_unknown',
        tier: 'starter',
        status: 'past_due',
        currentPeriodEnd: null,
        createdAt: new Date('2026-06-01'),
      },
    ]);
    db.billingSubscription.count.mockResolvedValue(2);
    // rosterOwnersByAccount → earliest-created member wins.
    db.rosterMembership.findMany.mockResolvedValue([
      {
        accountId: 'wks_team',
        createdAt: new Date('2026-06-01'),
        identity: { email: 'owner@example.com', name: 'Owner' },
      },
    ]);

    const res = await request(crmApp()).get('/admin/crm/transactions');
    expect(res.status).toBe(200);
    const rows = res.body.data.rows as Array<{
      id: string;
      customer: string;
      kind: string;
      tier: string;
      status: string;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'bsub_1',
      customer: 'owner@example.com',
      kind: 'subscription',
      tier: 'pro',
      status: 'active',
    });
    // No roster sighting → accountId shown instead of a person.
    expect(rows[1]!.customer).toBe('acc_unknown');
    expect(res.body.data.summary).toHaveLength(3);
  });
});

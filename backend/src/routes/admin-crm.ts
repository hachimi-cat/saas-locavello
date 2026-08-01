import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { sendOk } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { rosterOwnersByAccount } from '../lib/identity-roster.js';

/*
 * /api/v1/admin/crm — the standardized Forjio CRM contract (stats /
 * customers / transactions), served s2s to the central admin portal
 * (admin.forjio.com) behind adminGuard's X-Forjio-Admin-Secret path.
 *
 * Locavello semantics: a "customer" at the CRM level is a PERSON from
 * the identity roster (who signed in, which workspaces they act under,
 * how many projects those workspaces run). Workspaces with projects but
 * no roster sighting yet — sessions predating the roster — appear as
 * accountId-only fallback rows until someone signs in; nothing
 * historical exists to backfill. Money lives in Plugipay; the local
 * "transactions" are the subscription-tier rows the checkout webhook
 * writes.
 */

const router = Router();

const fmtCount = (n: number) => n.toLocaleString('en-US');

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const since30d = new Date(Date.now() - ACTIVE_WINDOW_MS);
    const [workspaces, projects, keys, words30d, wordsAll] = await Promise.all([
      prisma.project.groupBy({ by: ['accountId'] }).then((r) => r.length),
      prisma.project.count(),
      prisma.key.count({ where: { archived: false } }),
      prisma.agentUsage.aggregate({
        _sum: { words: true },
        where: { createdAt: { gte: since30d } },
      }),
      prisma.agentUsage.aggregate({ _sum: { words: true } }),
    ]);
    const w30 = words30d._sum.words ?? 0;
    sendOk(res, req, {
      stats: [
        { key: 'workspaces', label: 'Workspaces with projects', value: fmtCount(workspaces) },
        { key: 'projects', label: 'Projects', value: fmtCount(projects), accent: true },
        { key: 'keys', label: 'Active keys', value: fmtCount(keys) },
        { key: 'agentWords30d', label: 'Agent words (30d)', value: fmtCount(w30), accent: w30 > 0 },
        {
          key: 'agentWords',
          label: 'Agent words (lifetime)',
          value: fmtCount(wordsAll._sum.words ?? 0),
        },
      ],
    });
  }),
);

router.get(
  '/customers',
  asyncHandler(async (req, res) => {
    const [identities, memberships, projectGroups] = await Promise.all([
      prisma.rosterIdentity.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.rosterMembership.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.project.groupBy({
        by: ['accountId'],
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { updatedAt: true },
      }),
    ]);

    const projectsByAccount = new Map(projectGroups.map((g) => [g.accountId, g._count._all]));
    const membershipsBySub = new Map<string, string[]>();
    for (const m of memberships) {
      const list = membershipsBySub.get(m.huudisSub) ?? [];
      list.push(m.accountId);
      membershipsBySub.set(m.huudisSub, list);
    }
    const rosteredAccounts = new Set(memberships.map((m) => m.accountId));
    const activeCutoff = Date.now() - ACTIVE_WINDOW_MS;

    // One row per roster identity: who they are + the workspaces they
    // act under + how many projects those workspaces run.
    const customers = identities.map((i) => {
      const workspaces = membershipsBySub.get(i.huudisSub) ?? [];
      const projectCount = workspaces.reduce(
        (acc, accountId) => acc + (projectsByAccount.get(accountId) ?? 0),
        0,
      );
      return {
        id: i.huudisSub,
        email: i.email as string | null,
        name: i.name,
        signupAt: i.createdAt as Date | null,
        lastActiveAt: i.lastSeenAt as Date | null,
        status: i.lastSeenAt.getTime() >= activeCutoff ? 'active' : 'quiet',
        metrics: [
          { label: 'Workspaces', value: fmtCount(workspaces.length) },
          { label: 'Projects', value: fmtCount(projectCount) },
        ],
        // Raw fields for the in-product admin portal (the central
        // portal reads the standardized fields above).
        workspaces,
        projectCount,
      };
    });

    // Fallback rows: workspaces running projects that no roster
    // identity has been seen under (sessions predating the roster).
    // They stay accountId-only until someone signs in.
    for (const g of projectGroups) {
      if (rosteredAccounts.has(g.accountId)) continue;
      customers.push({
        id: g.accountId,
        email: null,
        name: g.accountId,
        signupAt: g._min.createdAt,
        lastActiveAt: g._max.updatedAt,
        status:
          g._max.updatedAt && g._max.updatedAt.getTime() >= activeCutoff ? 'active' : 'quiet',
        metrics: [
          { label: 'Workspaces', value: '1' },
          { label: 'Projects', value: fmtCount(g._count._all) },
        ],
        workspaces: [g.accountId],
        projectCount: g._count._all,
      });
    }

    sendOk(res, req, { customers });
  }),
);

router.get(
  '/transactions',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const [subs, total, active, paid] = await Promise.all([
      prisma.billingSubscription.findMany({ orderBy: { createdAt: 'desc' }, take: limit }),
      prisma.billingSubscription.count(),
      prisma.billingSubscription.count({ where: { status: 'active' } }),
      prisma.billingSubscription.count({
        where: { status: 'active', tier: { not: 'free' } },
      }),
    ]);
    // Roster join: a subscription row only knows the workspace; resolve
    // it to the best-known person for the `customer` column.
    const owners = await rosterOwnersByAccount(subs.map((s) => s.accountId));
    sendOk(res, req, {
      summary: [
        { label: 'Subscriptions', value: fmtCount(total) },
        { label: 'Active', value: fmtCount(active) },
        { label: 'Paid tiers (active)', value: fmtCount(paid) },
      ],
      rows: subs.map((s) => ({
        id: s.id,
        at: s.createdAt,
        customer: owners.get(s.accountId)?.email ?? s.accountId,
        kind: 'subscription',
        // Plugipay owns the money ledger — no local amount to report.
        amount: null,
        status: s.status,
        description: `${s.tier} tier`,
        // Subscription detail for the in-product admin portal (additive
        // — the central portal reads only the standardized fields).
        tier: s.tier,
        periodEnd: s.currentPeriodEnd,
        accountId: s.accountId,
      })),
    });
  }),
);

export default router;

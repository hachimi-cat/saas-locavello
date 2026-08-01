import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import {
  collectBusinessMetrics,
  collectLocavelloMetrics,
  defaultWindow,
  type MetricsAdapter,
} from '../lib/business-metrics.js';

/*
 * GET /api/v1/admin/metrics?days=30 — locavello's business metrics.
 *
 * Mounted behind `adminGuard`; powers `BusinessMetricsPanel` and the
 * headline tiles on `AdminOverviewPanel` from @forjio/admin-ui.
 * Mandatory admin-portal standard.
 *
 * The standard payload keeps its exact shape; the localization-specific
 * counters (projects, keys, translation statuses, releases, agent
 * words, TM) ride ADDITIVELY under `product` — admin-ui ignores keys it
 * doesn't know.
 *
 * No `transactions` slice: locavello has no local money ledger —
 * Plugipay owns payments; the only local billing record is the
 * subscription tier row (surfaced by /admin/crm/transactions). The
 * contract zeroes the slice, which is honest: Rp 0 seen HERE, real
 * money lives in the Plugipay console.
 */

const adapter: MetricsAdapter = {
  workspaces: async ({ from }) => {
    // A locavello tenant IS a Huudis accountId; a workspace "exists"
    // for this product once it has a project. Active = saw localization
    // work in the window (key/extract churn, translation writes, or a
    // release) — project.updatedAt alone misses translation-only edits.
    const [total, active] = await Promise.all([
      prisma.project.groupBy({ by: ['accountId'] }).then((r) => r.length),
      prisma.project
        .findMany({
          where: {
            OR: [
              { updatedAt: { gte: from } },
              { keys: { some: { updatedAt: { gte: from } } } },
              { keys: { some: { translations: { some: { updatedAt: { gte: from } } } } } },
              { releases: { some: { createdAt: { gte: from } } } },
            ],
          },
          distinct: ['accountId'],
          select: { accountId: true },
        })
        .then((r) => r.length),
    ]);
    return { total, active };
  },

  // Distinct identities from the SSO roster, not membership rows: one
  // person in three workspaces is one member, and counting rows would
  // triple them.
  workspaceMembers: async () =>
    prisma.rosterMembership
      .findMany({ distinct: ['huudisSub'], select: { huudisSub: true } })
      .then((r) => r.length),
};

const router = Router();

router.get('/', async (req, res) => {
  const raw = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
  // Clamped rather than rejected: a silly `?days=100000` should give an
  // operator a year of data, not a validation error.
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;
  try {
    const [metrics, product] = await Promise.all([
      collectBusinessMetrics(adapter, defaultWindow(days)),
      collectLocavelloMetrics(),
    ]);
    return sendOk(res, req, { ...metrics, product });
  } catch (e) {
    return sendErr(res, req, 500, 'METRICS_COLLECT_FAILED', (e as Error).message);
  }
});

export default router;

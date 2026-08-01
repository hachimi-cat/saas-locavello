import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import {
  collectBusinessMetrics,
  defaultWindow,
  type MetricsAdapter,
} from '../lib/business-metrics.js';

/*
 * GET /api/v1/admin/metrics?days=30 — this product's business metrics.
 *
 * Mounted behind `adminGuard`; powers `BusinessMetricsPanel` and the
 * headline tiles on `AdminOverviewPanel` from @forjio/admin-ui.
 *
 * FORKERS: fill in `adapter` against your own schema. The template ships
 * it empty on purpose — an empty adapter still returns a VALID, fully
 * shaped payload (zeroed slices, real Huudis user counts), so the admin
 * portal renders from day one and each slice can be filled in
 * independently.
 *
 *   const adapter: MetricsAdapter = {
 *     workspaces: async ({ from }) => ({
 *       total: await prisma.workspace.count(),
 *       active: await prisma.workspace.count({ where: { lastSeenAt: { gte: from } } }),
 *     }),
 *     transactions: async ({ from, to }) => { ... },
 *   };
 */

const adapter: MetricsAdapter = {};

const router = Router();

router.get('/', async (req, res) => {
  const raw = typeof req.query.days === 'string' ? Number(req.query.days) : 30;
  // Clamped rather than rejected: a silly `?days=100000` should give an
  // operator a year of data, not a validation error.
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;
  try {
    return sendOk(res, req, await collectBusinessMetrics(adapter, defaultWindow(days)));
  } catch (e) {
    return sendErr(res, req, 500, 'METRICS_COLLECT_FAILED', (e as Error).message);
  }
});

export default router;

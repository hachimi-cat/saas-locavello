import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import { collectSystemHealth } from '../lib/system-health.js';

/*
 * GET /api/v1/admin/system-health — the operator health view.
 *
 * Mounted behind `adminGuard`; powers `SystemHealthPanel` from
 * @forjio/admin-ui. Part of the mandatory admin-portal standard.
 *
 * Distinct from the unauthenticated `/health` liveness probe, which
 * answers "is this process up" for a load balancer in a few bytes. This
 * one reaches out to the database and every configured integration, so it
 * is authenticated (it reveals dependency topology) and must not be
 * polled aggressively — the panel defaults to 30s.
 *
 * FORKERS: pass your product's own probes as `extra`, e.g.
 *
 *   collectSystemHealth({
 *     plugipay: async () =>
 *       plugipayConfigured()
 *         ? { key: 'plugipay', label: 'Plugipay (billing)', status: 'ok', detail: null }
 *         : null,   // null → reported as 'skipped', never omitted
 *   })
 */

const router = Router();

router.get('/', async (req, res) => {
  try {
    return sendOk(res, req, await collectSystemHealth());
  } catch (e) {
    // Only reachable if the collector itself throws — individual probes
    // already degrade to their own row.
    return sendErr(res, req, 500, 'HEALTH_COLLECT_FAILED', (e as Error).message);
  }
});

export default router;

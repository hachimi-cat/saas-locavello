import { Router } from 'express';
import { sendOk, sendErr } from '../lib/http.js';
import { collectSystemHealth, type CheckStatus } from '../lib/system-health.js';
import { plugipayConfigured } from '../lib/plugipay.js';

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
 * Locavello probes (postgres + Huudis come from the collector itself):
 *   - plugipay  — billing API health endpoint.
 *   - catentio  — the agent-translation provider. An authenticated 200
 *     AND a 401/403 both mean "reachable and talking" — a probe that
 *     pages you because a key rotated is telling you the wrong thing;
 *     key problems surface as failed jobs, not as an outage row.
 */

const INTEGRATION_TIMEOUT_MS = 3_000;

async function probePlugipay(): Promise<{
  key: string;
  label: string;
  status: CheckStatus;
  detail: string | null;
} | null> {
  if (!plugipayConfigured()) return null; // reported as 'skipped'
  const base = process.env.PLUGIPAY_BASE_URL ?? 'https://plugipay.com';
  const res = await fetch(`${base}/api/v1/health`, {
    signal: AbortSignal.timeout(INTEGRATION_TIMEOUT_MS),
  });
  return {
    key: 'plugipay',
    label: 'Plugipay (billing)',
    status: res.ok ? 'ok' : 'degraded',
    detail: res.ok ? null : `HTTP ${res.status}`,
  };
}

async function probeCatentio(): Promise<{
  key: string;
  label: string;
  status: CheckStatus;
  detail: string | null;
} | null> {
  const apiKey = process.env.CATENTIO_API_KEY;
  if (!apiKey) return null; // reported as 'skipped'
  const base = process.env.CATENTIO_API_URL ?? 'https://catent.io';
  const res = await fetch(`${base}/v1/agents`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(INTEGRATION_TIMEOUT_MS),
  });
  // 200 = healthy; 401/403 = reachable but the key is off — the API is
  // up, so the row stays 'ok' with the auth detail surfaced.
  const reachable = res.ok || res.status === 401 || res.status === 403;
  return {
    key: 'catentio',
    label: 'Catentio (agent runs)',
    status: reachable ? 'ok' : 'degraded',
    detail: res.ok ? null : `HTTP ${res.status}${reachable ? ' (reachable, check API key)' : ''}`,
  };
}

const router = Router();

router.get('/', async (req, res) => {
  try {
    return sendOk(
      res,
      req,
      await collectSystemHealth({
        // Thrown errors (network down, timeout) are caught by the
        // collector and reported as 'down' on the probe's own row.
        plugipay: probePlugipay,
        catentio: probeCatentio,
      }),
    );
  } catch (e) {
    // Only reachable if the collector itself throws — individual probes
    // already degrade to their own row.
    return sendErr(res, req, 500, 'HEALTH_COLLECT_FAILED', (e as Error).message);
  }
});

export default router;

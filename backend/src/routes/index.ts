import { Router } from 'express';
import type { Router as ExpressRouter } from 'express';
import { sendOk } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import authRouter from './auth.js';
import huudisProxyRouter from './huudis-proxy.js';
import { adminGuard } from '../middleware/admin-guard.js';
import adminCustomersRouter from './admin-customers.js';
import adminMetricsRouter from './admin-metrics.js';
import adminSystemHealthRouter from './admin-system-health.js';
import adminFeatureFlagsRouter from './admin-feature-flags.js';
import adminCrmRouter from './admin-crm.js';
import { requireAuthOrApiKey } from '../middleware/api-key.js';
import projectsRouter from './projects.js';
import keysRouter from './keys.js';
import translationsRouter from './translations.js';
import releasesRouter from './releases.js';
import glossaryRouter from './glossary.js';
import tmRouter from './tm.js';
import apiKeysRouter from './api-keys.js';
import webhookSubscriptionsRouter from './webhook-subscriptions.js';
import auditRouter from './audit.js';
import translateRouter from './translate.js';
import publicRouter from './public.js';
import billingRouter from './billing.js';
import webhooksPlugipayRouter from './webhooks-plugipay.js';
import { rateLimit } from '../middleware/rate-limit.js';
import catentioRouter from './catentio.js';

/**
 * Route factory. Ported from saas-plugipay.
 *
 * Every product's `app.ts` calls this with `createApp({
 * enableTestOnlyRoutes })`; pass `true` in tests that need the
 * `/test-only/*` mount (e.g. to stub auth context). Never enable in
 * production.
 */
export interface RoutesOptions {
  enableTestOnlyRoutes?: boolean;
}

async function checkDb(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkOutbox(): Promise<'ok' | 'error'> {
  try {
    await prisma.outboxEvent.count();
    return 'ok';
  } catch {
    return 'error';
  }
}

export default function routes(_opts: RoutesOptions = {}): ExpressRouter {
  const router = Router();

  /** GET /api/v1/health — no auth, returns service name + status +
   *  dependency checks. Every Forjio service exposes the same shape
   *  so uptime monitors are uniform. */
  router.get('/health', async (req, res) => {
    const [db, outbox] = await Promise.all([checkDb(), checkOutbox()]);
    sendOk(res, req, {
      service: process.env.FORJIO_SERVICE ?? 'locavello',
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
      checks: { db, outbox },
    });
  });

  /** Auth — cookie-first Huudis SSO. Login/signup/password-reset/OIDC.
   *  Powers the `(auth)` pages + the `(dashboard)` gate. */
  router.use('/auth', authRouter);

  /** Huudis IAM proxy — account + workspace management. The frontend
   *  calls /api/v1/huudis/{account,account/workspaces,iam/users} and
   *  the kit forwards them to Huudis with the server-side token. */
  router.use('/huudis', huudisProxyRouter);

  /** Admin "Customers" — this product's own users, pulled from Huudis
   *  via the product's OIDC client creds. Proxied from the admin portal
   *  at /api/v1/console/customers. */
  router.use('/admin/customers', adminGuard, adminCustomersRouter);

  /** The three endpoints behind the MANDATORY admin-portal standard —
   *  business metrics, system metrics, feature flags. Every Forjio
   *  product serves these; see
   *  forjio/documentation/2. Technical/13-Admin-Portal-Standard.md.
   *  Do not remove them when forking — add your own alongside. */
  router.use('/admin/metrics', adminGuard, adminMetricsRouter);
  router.use('/admin/system-health', adminGuard, adminSystemHealthRouter);
  router.use('/admin/feature-flags', adminGuard, adminFeatureFlagsRouter);

  /** Admin CRM — the standardized stats/customers/transactions contract
   *  the central admin.forjio.com portal consumes s2s (adminGuard's
   *  X-Forjio-Admin-Secret path). Customers resolve to real people via
   *  the identity roster. */
  router.use('/admin/crm', adminGuard, adminCrmRouter);

  // ── Mode B public surface (NO auth — capped + rate-limited) ──────
  // /public/preview costs real agent words per call; ingress-class
  // rate limiting is the wallet guard. The catalog endpoint is the
  // fail-open serving path for locavello.js.
  router.use('/public', rateLimit('ingress'), publicRouter);

  /** Plugipay billing webhooks — signature-verified, no session. */
  router.use('/webhooks/plugipay', webhooksPlugipayRouter);

  // ── Locavello engine ──────────────────────────────────────────────
  // Everything is behind requireAuthOrApiKey: the portal uses the BFF
  // session cookie, the CLI/SDK use `Bearer lv_live_…` keys. Auth is
  // scoped to the engine prefixes ONCE (not per-router) so it never
  // shadows the /api/v1 404 fallthrough and never runs twice for the
  // routers that share the /projects prefix.
  router.use(
    [
      '/projects',
      '/keys',
      '/translations',
      '/glossary',
      '/tm',
      '/api-keys',
      '/billing',
      '/webhook-subscriptions',
      '/audit',
    ],
    requireAuthOrApiKey,
  );
  router.use('/billing', billingRouter);
  router.use('/projects', projectsRouter);
  router.use('/projects', keysRouter);
  router.use('/', translationsRouter); // /keys/:keyId/*, /translations/:id/*, /projects/:id/review-queue
  router.use('/projects', releasesRouter);
  router.use('/projects', translateRouter); // /:id/translate, /:id/jobs, /jobs/:jobId
  // The embedded catentio assistant's BFF (distinct from lib/catentio.ts,
  // which dispatches the locavello-translator agent as the translation
  // provider). Delegated agent runs are refused here by name.
  router.use('/catentio', catentioRouter);
  router.use('/glossary', glossaryRouter);
  router.use('/tm', tmRouter);
  router.use('/api-keys', apiKeysRouter);
  router.use('/webhook-subscriptions', webhookSubscriptionsRouter);
  router.use('/audit', auditRouter);

  return router;
}

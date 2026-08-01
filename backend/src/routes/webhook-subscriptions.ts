import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, notFound, pathParam, sendCreated, sendOk } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { generateWebhookSecret } from '../lib/webhook-signature.js';
import { recordAudit, actorOf } from '../lib/audit.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { Request } from 'express';

/*
 * /api/v1/webhook-subscriptions — customer endpoints receiving
 * locavello.* events (delivered by services/outbox-worker.ts, signed
 * `Locavello-Signature: t=…,v1=…`). The serront pattern.
 *
 * The signing secret is returned ONCE on creation; list responses
 * never include it.
 */

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

const SAFE_SELECT = {
  id: true,
  url: true,
  events: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** "*" or a versioned locavello event type (locavello.release.published.v1, …).
 *  Format-checked rather than catalog-checked so new event types don't
 *  require a portal redeploy to subscribe to. */
const eventPattern = z
  .string()
  .refine((s) => s === '*' || /^locavello\.[a-z_]+(\.[a-z_]+)*\.v\d+$/.test(s), {
    message: 'must be "*" or a versioned locavello event type',
  });

router.get(
  '/',
  rateLimit('read'),
  h(async (req, res) => {
    const rows = await prisma.webhookSubscription.findMany({
      where: { accountId: accountId(req) },
      orderBy: { createdAt: 'desc' },
      select: SAFE_SELECT,
    });
    return sendOk(res, req, { subscriptions: rows });
  }),
);

const createBody = z.object({
  url: z.string().trim().url().max(2000).startsWith('http'),
  events: z.array(eventPattern).min(1).max(20).optional(),
});

router.post(
  '/',
  rateLimit('mutating_light'),
  h(async (req, res) => {
    const input = createBody.parse(req.body ?? {});
    const secret = generateWebhookSecret();
    const row = await prisma.webhookSubscription.create({
      data: {
        id: newId('whs'),
        accountId: accountId(req),
        url: input.url,
        secret,
        events: input.events ?? ['*'],
      },
      select: SAFE_SELECT,
    });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'webhook.created',
      target: { type: 'webhook', id: row.id },
      summary: `Added webhook endpoint ${row.url}`,
      metadata: { url: row.url, events: input.events ?? ['*'] },
    });
    // The signing secret is returned ONCE here and never again.
    return sendCreated(res, req, { ...row, secret });
  }),
);

const patchBody = z.object({
  active: z.boolean(),
});

router.patch(
  '/:id',
  rateLimit('mutating_light'),
  h(async (req, res) => {
    const input = patchBody.parse(req.body ?? {});
    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: pathParam(req, 'id'), accountId: accountId(req) },
    });
    if (!existing) throw notFound('webhook subscription not found');
    const row = await prisma.webhookSubscription.update({
      where: { id: existing.id },
      data: { active: input.active },
      select: SAFE_SELECT,
    });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: input.active ? 'webhook.enabled' : 'webhook.disabled',
      target: { type: 'webhook', id: existing.id },
      summary: `${input.active ? 'Enabled' : 'Disabled'} webhook endpoint ${existing.url}`,
      metadata: { url: existing.url },
    });
    return sendOk(res, req, row);
  }),
);

router.delete(
  '/:id',
  rateLimit('mutating_light'),
  h(async (req, res) => {
    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: pathParam(req, 'id'), accountId: accountId(req) },
    });
    if (!existing) throw notFound('webhook subscription not found');
    await prisma.webhookSubscription.delete({ where: { id: existing.id } });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'webhook.deleted',
      target: { type: 'webhook', id: existing.id },
      summary: `Removed webhook endpoint ${existing.url}`,
      metadata: { url: existing.url },
    });
    return sendOk(res, req, { deleted: true });
  }),
);

export default router;

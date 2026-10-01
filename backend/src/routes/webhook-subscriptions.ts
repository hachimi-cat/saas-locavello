import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, notFound, pathParam, sendCreated, sendList, sendOk, validation } from '../lib/http.js';
import { decodeCursor, encodeCursor } from '../lib/cursor.js';
import { newId } from '../lib/ids.js';
import { generateWebhookSecret } from '../lib/webhook-signature.js';
import { assertSafeWebhookUrl, BlockedTargetError } from '../lib/webhook-target.js';
import { EVENT_TYPES } from '../lib/event-types.js';
import { recordAudit, actorOf } from '../lib/audit.js';
import { failPendingDeliveries, retryWebhookDelivery } from '../services/webhook-delivery.js';
import { rateLimit } from '../middleware/rate-limit.js';
import type { Request } from 'express';

/*
 * /api/v1/webhook-subscriptions — customer endpoints receiving locavello.*
 * events, and the log of what was delivered to them. Deliveries are sent,
 * retried and recorded by services/webhook-delivery.ts, signed
 * `Locavello-Signature: t=…,v1=…`.
 *
 * The signing secret is returned ONCE on creation; list responses never
 * include it.
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
  consecutiveFailures: true,
  failingSince: true,
  disabledAt: true,
  disabledReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** A delivery as the API shows it, with every attempt made at it (oldest
 *  first). `body` is the exact JSON sent on every attempt. */
const DELIVERY_SELECT = {
  id: true,
  subscriptionId: true,
  eventId: true,
  type: true,
  body: true,
  status: true,
  attempts: true,
  nextRetryAt: true,
  lastAttemptAt: true,
  deliveredAt: true,
  responseCode: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  attemptLog: {
    orderBy: { attemptNumber: 'asc' },
    select: {
      attemptNumber: true,
      status: true,
      responseCode: true,
      durationMs: true,
      error: true,
      nextRetryAt: true,
      attemptedAt: true,
    },
  },
} as const satisfies Prisma.WebhookDeliverySelect;

/** "*", a versioned locavello event type (locavello.release.published.v1, …)
 *  or a prefix ending in "*" (locavello.release.*). Format-checked rather
 *  than catalog-checked so new event types don't require a portal redeploy
 *  to subscribe to. */
const eventPattern = z
  .string()
  .refine(
    (s) => s === '*' || /^locavello\.[a-z_]+(\.[a-z_]+)*\.v\d+$/.test(s) || /^locavello\.([a-z_]+\.)*\*$/.test(s),
    { message: 'must be "*", a versioned locavello event type, or a prefix like "locavello.release.*"' },
  );

/** The SSRF guard (lib/webhook-target.ts) as a 400 the caller can act on. */
async function assertCallable(url: string): Promise<void> {
  try {
    await assertSafeWebhookUrl(url);
  } catch (e) {
    if (e instanceof BlockedTargetError) throw validation(`url: ${e.message}`, 'url');
    throw e;
  }
}

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

/** The event types a subscription can name: every locavello.*.v1 type
 *  Locavello sends, with what it means. */
router.get(
  '/event-types',
  rateLimit('read'),
  h(async (req, res) => sendOk(res, req, { types: EVENT_TYPES })),
);

const createBody = z.object({
  url: z.string().trim().url().max(2000).startsWith('http'),
  events: z.array(eventPattern).min(1).max(20).optional(),
});

/** Add an endpoint. The URL must be https (in production) and must not point
 *  at a private, loopback or link-local address. */
router.post(
  '/',
  rateLimit('mutating_light'),
  h(async (req, res) => {
    const input = createBody.parse(req.body ?? {});
    await assertCallable(input.url);
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

const listDeliveriesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
  subscriptionId: z.string().min(1).optional(),
  status: z.enum(['pending', 'succeeded', 'failed']).optional(),
  type: z.string().min(1).optional(),
});

/**
 * List webhook deliveries. Newest first: one row per event per endpoint, with
 * its status (pending, succeeded, failed), attempt count, next retry, the body
 * sent and every attempt made (`attemptLog`). Filter by `subscriptionId`,
 * `status` or `type`; page with `limit` (1-100, default 20) and `meta.cursor`
 * while `meta.hasMore`.
 */
router.get(
  '/deliveries',
  rateLimit('read'),
  h(async (req, res) => {
    const { limit, cursor: rawCursor, subscriptionId, status, type } = listDeliveriesQuery.parse(req.query);
    const and: Prisma.WebhookDeliveryWhereInput[] = [{ accountId: accountId(req) }];
    if (subscriptionId) and.push({ subscriptionId });
    if (status) and.push({ status });
    if (type) and.push({ type });
    // After the cursor's row in (createdAt, id) order, so a page boundary
    // between rows made in the same millisecond skips none.
    const cursor = decodeCursor(rawCursor);
    if (cursor) {
      const d = new Date(cursor.createdAt);
      if (!Number.isNaN(d.getTime())) and.push({ OR: [{ createdAt: { lt: d } }, { createdAt: d, id: { lt: cursor.id } }] });
    }
    const rows = await prisma.webhookDelivery.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: DELIVERY_SELECT,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const hasMore = rows.length > limit;
    return sendList(res, req, page, hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null, hasMore);
  }),
);

/** Get a webhook delivery, with every attempt made at it. */
router.get(
  '/deliveries/:id',
  rateLimit('read'),
  h(async (req, res) => {
    const row = await prisma.webhookDelivery.findFirst({
      where: { id: pathParam(req, 'id'), accountId: accountId(req) },
      select: DELIVERY_SELECT,
    });
    if (!row) throw notFound('webhook delivery not found');
    return sendOk(res, req, row);
  }),
);

/**
 * Retry a webhook delivery. Queues one more attempt now at a failed delivery
 * (or sends a succeeded one again); it goes out within seconds — read it back
 * with GET /webhook-subscriptions/deliveries/:id. 202 with the delivery
 * `pending`; 409 ALREADY_QUEUED when it is pending already, 409
 * ENDPOINT_DISABLED when its endpoint is off.
 */
router.post(
  '/deliveries/:id/retry',
  rateLimit('mutating_light'),
  h(async (req, res) => {
    const out = await retryWebhookDelivery(accountId(req), pathParam(req, 'id'));
    if (!out.ok) throw new ApiError(out.code === 'NOT_FOUND' ? 404 : 409, out.code, out.message);
    const row = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: out.id }, select: DELIVERY_SELECT });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'webhook.delivery_retried',
      target: { type: 'webhook', id: row.subscriptionId },
      summary: `Retried the ${row.type} delivery ${row.id}`,
      metadata: { deliveryId: row.id, eventId: row.eventId, type: row.type },
    });
    return sendOk(res, req, row, 202);
  }),
);

const patchBody = z
  .object({
    active: z.boolean().optional(),
    url: z.string().trim().url().max(2000).startsWith('http').optional(),
    events: z.array(eventPattern).min(1).max(20).optional(),
  })
  .refine((b) => b.active !== undefined || b.url !== undefined || b.events !== undefined, {
    message: 'nothing to change: pass active, url or events',
  });

/**
 * Update an endpoint. `active: false` pauses it (its queued deliveries become
 * failed); `active: true` re-enables it — also after Locavello switched it off
 * for failing — and clears its failure streak. A new `url` goes through the
 * same checks as on create; the signing secret stays the same.
 */
router.patch(
  '/:id',
  rateLimit('mutating_light'),
  h(async (req, res) => {
    const input = patchBody.parse(req.body ?? {});
    const existing = await prisma.webhookSubscription.findFirst({
      where: { id: pathParam(req, 'id'), accountId: accountId(req) },
    });
    if (!existing) throw notFound('webhook subscription not found');
    if (input.url !== undefined && input.url !== existing.url) await assertCallable(input.url);
    const data: Prisma.WebhookSubscriptionUpdateInput = {
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.active === true
        ? { consecutiveFailures: 0, failingSince: null, disabledAt: null, disabledReason: null }
        : {}),
    };
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.webhookSubscription.update({ where: { id: existing.id }, data, select: SAFE_SELECT });
      if (input.active === false && existing.active) await failPendingDeliveries(tx, existing.id, 'endpoint is disabled');
      return updated;
    });
    const action =
      input.active === true ? 'webhook.enabled' : input.active === false ? 'webhook.disabled' : 'webhook.updated';
    const verb = input.active === true ? 'Enabled' : input.active === false ? 'Disabled' : 'Updated';
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action,
      target: { type: 'webhook', id: existing.id },
      summary: `${verb} webhook endpoint ${row.url}`,
      metadata: { url: row.url, ...(input.url !== undefined ? { previousUrl: existing.url } : {}), ...(input.events ? { events: input.events } : {}) },
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

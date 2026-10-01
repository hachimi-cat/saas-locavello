import crypto from 'node:crypto';
import { LocavelloError } from './index.js';

/**
 * Receiving Locavello webhooks. Every delivery is a POST with
 *
 *   Locavello-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * (plus Locavello-Event-Id, Locavello-Event-Type, Locavello-Delivery-Id and
 * Locavello-Delivery-Attempt) and the envelope { id, type, occurredAt, accountId, data } as
 * its body. Verify the signature over the RAW body (before any JSON parsing) with the
 * subscription's signing secret (`whsec_…`, shown once when the endpoint was added).
 * A delivery that is retried keeps its `id`: use it to drop duplicates.
 */

/** The event catalogue (GET /api/v1/webhook-subscriptions/event-types). */
export type LocavelloEventType =
  | 'locavello.project.created.v1'
  | 'locavello.translation.approved.v1'
  | 'locavello.release.published.v1'
  | 'locavello.billing.subscribed.v1'
  | 'locavello.webhook_subscription.disabled.v1';

export interface LocavelloWebhookEvent<T = Record<string, unknown>> {
  /** evt_… — the same on every delivery attempt; use it to drop duplicates. */
  id: string;
  type: LocavelloEventType | string;
  occurredAt: string;
  accountId: string;
  data: T;
}

/**
 * Verify a delivery and return its event. Throws LocavelloError (code `INVALID_SIGNATURE`)
 * when the header is missing or malformed, the timestamp is more than `toleranceSec`
 * (default 300) from now, the signature does not match, or the body is not JSON.
 *
 *   app.post('/hooks/locavello', express.raw({ type: 'application/json' }), (req, res) => {
 *     const event = verifyWebhook({
 *       rawBody: req.body,
 *       signature: req.header('Locavello-Signature'),
 *       secret: process.env.LOCAVELLO_WEBHOOK_SECRET!,
 *     });
 *     if (event.type === 'locavello.release.published.v1') { … }
 *     res.sendStatus(204);
 *   });
 */
export function verifyWebhook<T = Record<string, unknown>>(opts: {
  rawBody: string | Uint8Array;
  signature: string | undefined | null;
  secret: string;
  toleranceSec?: number;
  /** Seconds since the epoch — a clock for tests. */
  now?: number;
}): LocavelloWebhookEvent<T> {
  const fail = (message: string): never => {
    throw new LocavelloError(400, 'INVALID_SIGNATURE', message);
  };
  if (!opts.signature) fail('missing Locavello-Signature header');
  const parts: Record<string, string> = {};
  for (const segment of String(opts.signature).split(',')) {
    const i = segment.indexOf('=');
    if (i > 0) parts[segment.slice(0, i).trim()] = segment.slice(i + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) fail('malformed Locavello-Signature header');
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const drift = Math.abs(now - Number(t));
  if (drift > (opts.toleranceSec ?? 300)) fail(`signature timestamp is ${drift}s from now`);

  const body = typeof opts.rawBody === 'string' ? opts.rawBody : Buffer.from(opts.rawBody).toString('utf8');
  const expected = Buffer.from(crypto.createHmac('sha256', opts.secret).update(`${t}.${body}`).digest('hex'));
  const given = Buffer.from(v1!);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) fail('signature does not match');
  try {
    return JSON.parse(body) as LocavelloWebhookEvent<T>;
  } catch {
    return fail('webhook body is not valid JSON');
  }
}

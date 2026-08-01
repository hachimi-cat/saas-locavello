import { Router } from 'express';
import { verifyWebhook, PlugipayError } from '@forjio/plugipay-node';
import { prisma } from '../lib/db.js';
import { sendOk, sendErr } from '../lib/http.js';
import { h as asyncHandler } from '../lib/async-handler.js';
import { applyCheckoutCompleted, parseCheckoutMetadata } from '../lib/billing.js';

/*
 * POST /api/v1/webhooks/plugipay — inbound Plugipay billing events.
 *
 * Signature verification is identical to pawpado's webhook route:
 * Plugipay signs HMAC-SHA256 over `${timestamp}.${rawBody}` and sends
 * `X-Plugipay-Signature: t=<ts>,v1=<hex>`; we delegate to the SDK's
 * `verifyWebhook` (secret = PLUGIPAY_WEBHOOK_SECRET) so any
 * signature-format change tracks upstream automatically. The raw body
 * is captured by app.ts's express.json `verify` hook — verifying the
 * re-serialized parsed body would break on whitespace differences.
 *
 * Only event acted on: plugipay.checkout_session.completed.v1 with
 * metadata {accountId, tier} → upsert BillingSubscription (status
 * active, +30 days) + outbox locavello.billing.subscribed.v1. Idempotent
 * on the checkout session id. Everything else is logged and ignored.
 */

const router = Router();

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secret = process.env.PLUGIPAY_WEBHOOK_SECRET;
    if (!secret) {
      return sendErr(res, req, 401, 'NOT_CONFIGURED', 'PLUGIPAY_WEBHOOK_SECRET not configured');
    }
    if (!req.rawBody) {
      return sendErr(res, req, 400, 'VALIDATION_ERROR', 'missing request body');
    }

    let event;
    try {
      event = verifyWebhook(req.rawBody, req.headers['x-plugipay-signature'], secret);
    } catch (err) {
      if (err instanceof PlugipayError) {
        return sendErr(res, req, err.status, err.code, err.message);
      }
      return sendErr(res, req, 401, 'INVALID_SIGNATURE', (err as Error).message);
    }

    console.log(`[plugipay-webhook] ${event.type} id=${event.id}`);

    try {
      if (event.type === 'plugipay.checkout_session.completed.v1') {
        const session = event.data.object;
        const parsed = parseCheckoutMetadata(session.metadata);
        if (parsed) {
          const outcome = await applyCheckoutCompleted(prisma, {
            sessionId: session.id,
            accountId: parsed.accountId,
            tier: parsed.tier,
          });
          if (outcome === 'duplicate') {
            console.log(`[plugipay-webhook] session ${session.id} already applied — skipping`);
          }
        } else {
          console.warn(
            `[plugipay-webhook] completed session ${session.id} without locavello {accountId, tier} metadata — ignoring`,
          );
        }
      }
      // Other events (expired, invoice.*, …) are logged above and
      // ignored — v1 subscriptions renew via fresh checkouts.
    } catch (err) {
      console.error(`[plugipay-webhook] handler failed for ${event.type}`, err);
      // Still ack 200 — Plugipay retry semantics + our idempotency
      // mean we'd rather investigate from logs than have the same
      // event hammered until something breaks. (Same stance as
      // pawpado's webhook route.)
    }

    sendOk(res, req, { received: true });
  }),
);

export default router;

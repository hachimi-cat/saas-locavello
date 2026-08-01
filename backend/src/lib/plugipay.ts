import { PlugipayClient } from '@forjio/plugipay-node';

// ─────────────────────────────────────────────────────────────
// Locavello × Plugipay billing glue. Pattern ported from pawpado's
// frontend/src/lib/server/plugipay.ts, adapted to the Express
// backend (locavello's billing lives server-side here, not in Next).
//
// Locavello is a Plugipay merchant partner on the Forjio platform;
// checkout sessions carry the workspace accountId + tier in metadata
// and the webhook (routes/webhooks-plugipay.ts) records the
// subscription when the session completes.
//
// Env vars:
//   PLUGIPAY_KEY_ID          locavello's HMAC key id
//   PLUGIPAY_SECRET          matching secret
//   PLUGIPAY_BASE_URL        API host (default https://plugipay.com)
//   PLUGIPAY_CHECKOUT_BASE   user-facing checkout host (default
//                            https://plugipay.com) — what the browser
//                            navigates to; NOT the API host, which may
//                            be a loopback address when colocated.
//   PLUGIPAY_WEBHOOK_SECRET  webhook signature verification key
// ─────────────────────────────────────────────────────────────

let _client: PlugipayClient | null = null;

export function plugipayConfigured(): boolean {
  return Boolean(process.env.PLUGIPAY_KEY_ID && process.env.PLUGIPAY_SECRET);
}

export function getPlugipayClient(): PlugipayClient {
  if (_client) return _client;
  const keyId = process.env.PLUGIPAY_KEY_ID;
  const secret = process.env.PLUGIPAY_SECRET;
  if (!keyId || !secret) {
    throw new Error('PLUGIPAY_KEY_ID + PLUGIPAY_SECRET env vars required for billing');
  }
  _client = new PlugipayClient({
    keyId,
    secret,
    baseUrl: process.env.PLUGIPAY_BASE_URL ?? 'https://plugipay.com',
  });
  return _client;
}

/** The URL the buyer's browser should be redirected to for a hosted
 *  checkout session. Prefer the API-provided hostedUrl; fall back to
 *  the canonical /c/<id> path on the checkout host (pawpado learned
 *  2026-05-07 that returning the API host 404s when colocated). */
export function hostedCheckoutUrl(session: { id: string; hostedUrl?: string | null }): string {
  if (session.hostedUrl) return session.hostedUrl;
  const base = process.env.PLUGIPAY_CHECKOUT_BASE ?? 'https://plugipay.com';
  return `${base}/c/${session.id}`;
}

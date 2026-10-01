---
title: "Webhooks"
---

# Webhooks

Get an HTTPS POST at your own endpoint whenever something happens in your
workspace — a project is created, a translation is approved, a release is
published. Each endpoint (a **webhook subscription**) has its own signing
secret, chooses which events it wants, and every delivery is retried until
your endpoint answers and recorded in a delivery log you can read and retry
from.

Manage endpoints in the dashboard (**Webhooks**), with the CLI
(`locavello api webhook-subscriptions …`), the SDKs (`client.api.webhookSubscriptions…`)
or the API below. Every route takes your session or an `lv_live_…` API key.

## Add an endpoint

```bash
curl -X POST https://locavello.forjio.com/api/v1/webhook-subscriptions \
  -H "Authorization: Bearer $LOCAVELLO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hooks/locavello","events":["locavello.release.*"]}'
```

The response carries the endpoint and its signing secret, `whsec_…` —
**shown once**; store it now. (Lost it? Remove the endpoint and add it
again.)

- `url` must be `https://` and may not point at a private, loopback or
  link-local address (checked when you add or change it, and again on every
  delivery).
- `events` (optional, default `["*"]`): exact event types, a prefix ending in
  `*` (`locavello.release.*`), or `"*"` for everything.

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/webhook-subscriptions` | Your endpoints, never with their secret; each with `consecutiveFailures`, `failingSince`, `disabledAt`, `disabledReason` |
| POST | `/api/v1/webhook-subscriptions` | Add an endpoint (`{ url, events }`) — the response carries the one-time `secret` |
| PATCH | `/api/v1/webhook-subscriptions/{id}` | Change `url` / `events`, pause (`active: false`) or resume (`active: true`) |
| DELETE | `/api/v1/webhook-subscriptions/{id}` | Remove an endpoint and its delivery log |
| GET | `/api/v1/webhook-subscriptions/event-types` | The event catalogue below, as data |
| GET | `/api/v1/webhook-subscriptions/deliveries` | The delivery log, newest first |
| GET | `/api/v1/webhook-subscriptions/deliveries/{id}` | One delivery, with every attempt |
| POST | `/api/v1/webhook-subscriptions/deliveries/{id}/retry` | Send a delivery again now |

Pausing an endpoint fails what is queued for it; events that happen while it
is paused are not queued for it. Every change is in the workspace audit log
(`webhook.created`, `webhook.updated`, `webhook.enabled`, `webhook.disabled`,
`webhook.deleted`, `webhook.delivery_retried`, `webhook.auto_disabled`).

## Event catalogue

| Type | When |
|---|---|
| `locavello.project.created.v1` | A project is created. |
| `locavello.translation.approved.v1` | A reviewer approves a translation. |
| `locavello.release.published.v1` | A locale is published as a release (the bundle your apps and the CDN serve). |
| `locavello.billing.subscribed.v1` | The workspace starts or changes a paid plan. |
| `locavello.webhook_subscription.disabled.v1` | Locavello switched off one of your endpoints because it kept failing (sent to your *other* endpoints). |

### Payloads

Every delivery's body is the same envelope; `data` depends on the type.

```json
{
  "id": "evt_01k6…",
  "type": "locavello.release.published.v1",
  "occurredAt": "2026-10-01T09:12:44.120Z",
  "accountId": "acc_01k5…",
  "data": {
    "releaseId": "rel_01k6…",
    "locale": "id-ID",
    "contentHash": "9f2c…",
    "keyCount": 412,
    "totalKeys": 420
  }
}
```

| Type | `data` |
|---|---|
| `locavello.project.created.v1` | `projectId`, `slug`, `mode` (`sdk` or `proxy`) |
| `locavello.translation.approved.v1` | `translationId`, `keyId`, `locale` |
| `locavello.release.published.v1` | `releaseId`, `locale`, `contentHash`, `keyCount` (translated keys in the release), `totalKeys` |
| `locavello.billing.subscribed.v1` | `subscriptionId`, `tier`, `plugipayCheckoutSessionId`, `currentPeriodEnd` |
| `locavello.webhook_subscription.disabled.v1` | `id`, `url`, `disabledAt`, `disabledReason`, `consecutiveFailures`, `failingSince` |

A common use: on `locavello.release.published.v1`, pull the new bundle
(`locavello pull`) or purge your own cache for that `locale`.

## Verify the signature

Every delivery carries these headers:

```
Locavello-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
Locavello-Event-Id: evt_…          (the body's id — the same on every attempt)
Locavello-Event-Type: locavello.release.published.v1
Locavello-Delivery-Id: whd_…
Locavello-Delivery-Attempt: 1
```

Recompute the HMAC over the **raw** request body (before any JSON parsing)
with the endpoint's secret, compare in constant time, and reject a timestamp
more than 5 minutes from now. The SDKs do all of it:

**JavaScript / TypeScript** (`@forjio/locavello`)

```ts
import express from 'express';
import { verifyWebhook } from '@forjio/locavello';

app.post('/hooks/locavello', express.raw({ type: 'application/json' }), (req, res) => {
  const event = verifyWebhook({
    rawBody: req.body,
    signature: req.header('Locavello-Signature'),
    secret: process.env.LOCAVELLO_WEBHOOK_SECRET!,
  });
  if (event.type === 'locavello.release.published.v1') {
    // event.data.locale, event.data.releaseId …
  }
  res.sendStatus(204);
});
```

**Python** (`forjio-locavello`)

```python
from forjio_locavello import verify_webhook

event = verify_webhook(request.get_data(), request.headers.get("Locavello-Signature"),
                       os.environ["LOCAVELLO_WEBHOOK_SECRET"])
if event["type"] == "locavello.release.published.v1":
    ...
```

**Go** (`github.com/hachimi-cat/locavello-go`)

```go
body, _ := io.ReadAll(r.Body)
event, err := locavello.VerifyWebhook(body, r.Header.Get(locavello.SignatureHeader), secret, nil)
if err != nil {
	http.Error(w, "bad signature", http.StatusBadRequest)
	return
}
```

Each refuses a missing or malformed header, a stale timestamp, a wrong
signature or a non-JSON body with the code `INVALID_SIGNATURE`.

**By hand** (any language):

```js
const [t, v1] = header.split(',').map((kv) => kv.split('=')[1]);
const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
  && Math.abs(Date.now() / 1000 - Number(t)) < 300;
```

## Delivery

- A `2xx` answer within **10 seconds** is success. Anything else — another
  status, a redirect (never followed), a timeout, a refused connection — is a
  failed attempt.
- A failed attempt is retried **1 min, 5 min, 25 min, 2 h and 12 h** later (6
  attempts in all). After the 6th the delivery is `failed` and stays so until
  you retry it.
- Delivery is **at-least-once**: a retry can reach you after a slow success,
  so drop duplicates by the event `id` (the `Locavello-Event-Id` header).
- Events are fanned out in the order they happened, but retries can reorder
  them; use `occurredAt` when order matters.
- An endpoint receives the events that happen after it was added — nothing
  is backfilled.

### Endpoints that keep failing are switched off

After **20 failed attempts in a row** over **at least 24 hours**, Locavello
sets the endpoint's `active` to `false` with `disabledAt` and
`disabledReason`, marks what was queued for it `failed`, sends
`locavello.webhook_subscription.disabled.v1` to your other endpoints and
records `webhook.auto_disabled` in the audit log. Both conditions must hold,
so a short outage during a deploy never switches anyone off — the retries
ride it out. To recover: fix the receiver, `PATCH {"active": true}` (which
clears the failure streak), then retry what you missed.

## The delivery log

`GET /api/v1/webhook-subscriptions/deliveries` lists deliveries newest first —
one row per event per endpoint — with `status` (`pending`, `succeeded`,
`failed`), `attempts`, `nextRetryAt`, the last `responseCode` / `lastError`,
the exact `body` sent, and `attemptLog`: every attempt's number, status,
response code, duration, error and the retry it scheduled.

| Query | |
|---|---|
| `subscriptionId` | One endpoint's deliveries |
| `status` | `pending`, `succeeded` or `failed` |
| `type` | One event type |
| `limit` | 1–100, default 20 |
| `cursor` | The `meta.cursor` of the previous page, while `meta.hasMore` |

Retry one with `POST /api/v1/webhook-subscriptions/deliveries/{id}/retry`: it
answers `202` with the delivery `pending` and the attempt goes out within
seconds. `409 ALREADY_QUEUED` while it is still pending, `409
ENDPOINT_DISABLED` while its endpoint is off. Re-sending a delivery that
succeeded is allowed — useful after restoring a lost database on your side.

```bash
# everything that failed for one endpoint
locavello api webhook-subscriptions deliveries --subscription-id whs_… --status failed
# send one again
locavello api webhook-subscriptions deliveries-retry whd_…
```

Finished deliveries are kept for **30 days**; pending ones until they finish.

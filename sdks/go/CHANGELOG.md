# Changelog

## 0.4.0
- `VerifyWebhook(rawBody, signature, secret, opts)` checks a delivery's `Locavello-Signature` over the raw body (5-minute tolerance) and returns the `*WebhookEvent`; an `*Error` with Code `INVALID_SIGNATURE` otherwise. `SignatureHeader` and `EventTypes` (the catalogue).
- `client.API`: the webhook delivery log — `WebhookSubscriptionsDeliveries`, `WebhookSubscriptionsGetDeliveries` (with every attempt), `WebhookSubscriptionsDeliveriesRetry` — and `WebhookSubscriptionsEventTypes`. `WebhookSubscriptionsUpdate` also takes `URL` and `Events`.
- Deliveries are now retried (1 min, 5 min, 25 min, 2 h, 12 h) and recorded; the envelope carries `accountId`, and each delivery has `Locavello-Event-Id`, `-Event-Type`, `-Delivery-Id` and `-Delivery-Attempt` headers. Subscriptions take prefixes (`locavello.release.*`).

## 0.3.0
- A route read by id next to its list is named `get` + the list's name: `client.API.ProjectsGetJobs` (was `client.API.ProjectsJobs2`), `client.API.ProjectsGetReleases` (was `client.API.ProjectsReleases2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `locale` on GET /api/v1/public/projects/{id}/catalog, `q` on GET /api/v1/tm/search, `target` on GET /api/v1/tm/suggest, `text` on GET /api/v1/tm/suggest.


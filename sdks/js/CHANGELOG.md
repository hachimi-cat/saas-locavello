# Changelog

## 0.3.0
- `verifyWebhook({ rawBody, signature, secret })` checks a delivery's `Locavello-Signature` over the raw body (5-minute tolerance) and returns the event; throws `LocavelloError` with code `INVALID_SIGNATURE`. Exports the `LocavelloEventType` catalogue and `LocavelloWebhookEvent`.
- `client.api`: the webhook delivery log — `webhookSubscriptionsDeliveries({ subscriptionId?, status?, type?, limit?, cursor? })`, `webhookSubscriptionsGetDeliveries(id)` (with every attempt), `webhookSubscriptionsDeliveriesRetry(id)` — and `webhookSubscriptionsEventTypes()`. `webhookSubscriptionsUpdate(id, …)` also takes `url` and `events`.
- Deliveries are now retried (1 min, 5 min, 25 min, 2 h, 12 h) and recorded; the envelope carries `accountId`, and each delivery has `Locavello-Event-Id`, `-Event-Type`, `-Delivery-Id` and `-Delivery-Attempt` headers. Subscriptions take prefixes (`locavello.release.*`).

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `client.api.projectsGetJobs` (was `client.api.projectsJobs2`), `client.api.projectsGetReleases` (was `client.api.projectsReleases2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `locale` on GET /api/v1/public/projects/{id}/catalog, `q` on GET /api/v1/tm/search, `target` on GET /api/v1/tm/suggest, `text` on GET /api/v1/tm/suggest.


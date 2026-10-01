# Changelog

## 0.3.0
- `verify_webhook(raw_body, signature, secret)` checks a delivery's `Locavello-Signature` over the raw body (5-minute tolerance) and returns the event; raises `LocavelloError` with code `INVALID_SIGNATURE`. `EVENT_TYPES` lists the catalogue.
- `client.api`: the webhook delivery log — `webhook_subscriptions_deliveries(subscription_id=, status=, type_=, limit=, cursor=)`, `webhook_subscriptions_get_deliveries(id_)` (with every attempt), `webhook_subscriptions_deliveries_retry(id_)` — and `webhook_subscriptions_event_types()`. `webhook_subscriptions_update` also takes `url` and `events`.
- Deliveries are now retried (1 min, 5 min, 25 min, 2 h, 12 h) and recorded; the envelope carries `accountId`, and each delivery has `Locavello-Event-Id`, `-Event-Type`, `-Delivery-Id` and `-Delivery-Attempt` headers. Subscriptions take prefixes (`locavello.release.*`).

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `client.api.projects_get_jobs` (was `client.api.projects_jobs_2`), `client.api.projects_get_releases` (was `client.api.projects_releases_2`). Each old name stays as a deprecated alias.
- Query fields the API refuses a request without are now required: `locale` on GET /api/v1/public/projects/{id}/catalog, `q` on GET /api/v1/tm/search, `target` on GET /api/v1/tm/suggest, `text` on GET /api/v1/tm/suggest.


# Changelog

## Unreleased
- `locavello api webhook-subscriptions deliveries` (`--subscription-id`, `--status`, `--type`, paged), `get-deliveries <id>` (with every attempt), `deliveries-retry <id>` and `event-types`; `update <id>` also takes `--url` and `--events`.

## 0.2.0
- A route read by id next to its list is named `get` + the list's name: `locavello api projects get-jobs` (was `locavello api projects jobs-2`), `locavello api projects get-releases` (was `locavello api projects releases-2`). Each old name still works, hidden from help.
- Query fields the API refuses a request without are now required: `locale` on GET /api/v1/public/projects/{id}/catalog, `q` on GET /api/v1/tm/search, `target` on GET /api/v1/tm/suggest, `text` on GET /api/v1/tm/suggest.


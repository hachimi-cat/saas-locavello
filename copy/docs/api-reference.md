---
title: "API reference"
---

# API reference

The Locavello REST API — everything the dashboard and CLI do, you can
do.

## Base URL

```
https://locavello.forjio.com/api/v1
```

## Authentication

Every request carries an API key as a bearer token:

```
Authorization: Bearer lv_live_xxx
```

Create keys in **Dashboard → Developers** (or via
[`POST /api-keys`](#api-keys)). The plaintext is returned **once** at
creation; Locavello stores only a SHA-256 hash. Keys are scoped to your
account and act on the projects it owns. A revoked or unknown key gets
`401 INVALID_API_KEY`; a request with no credentials gets
`401 AUTH_REQUIRED`.

## Response envelope

Every response — success or error — uses the family-standard envelope:

```json
{
  "data": { "id": "prj_01jxxxxxxxxxxxxxxxxxxxxxxx", "name": "My app" },
  "error": null,
  "meta": { "requestId": "req_xxx", "timestamp": "2026-08-01T00:00:00.000Z" }
}
```

On error, `data` is `null` and `error` carries an UPPER_SNAKE_CASE
`code`, a human-readable `message`, and sometimes the offending
`param`:

```json
{
  "data": null,
  "error": {
    "code": "PLACEHOLDER_MISMATCH",
    "message": "translation must use exactly the source placeholders (missing: [count], extra: [])",
    "param": "value"
  },
  "meta": { "requestId": "req_xxx", "timestamp": "2026-08-01T00:00:00.000Z" }
}
```

### Error codes

| Code | Status | Meaning |
|---|---|---|
| `AUTH_REQUIRED` | 401 | No usable credentials |
| `INVALID_API_KEY` | 401 | Unknown or revoked `lv_` key |
| `VALIDATION_ERROR` | 400/422 | Body or query failed validation (`param` names the field) |
| `NOT_FOUND` | 404 | Resource missing or not owned by your account |
| `CONFLICT` | 409 | Uniqueness conflict (duplicate slug, locale, namespace, glossary term) |
| `PLACEHOLDER_MISMATCH` | 422 | Translation drops/invents ICU placeholders — see [placeholder safety](/docs/placeholder-safety) |
| `UPGRADE_REQUIRED` | 403 | The requested agent run would exceed your plan's agent-word budget |
| `INVALID_URL` / `FETCH_FAILED` / `NO_TEXT` / `PREVIEW_BUDGET_EXHAUSTED` | 422/503 | Public preview failures (see below) |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

### Pagination

List endpoints take `?limit=` (1–100, default 20) and `?cursor=`. The
response's `meta` carries `cursor` (pass it back to get the next page)
and `hasMore`.

---

## Projects

#### POST /projects

```json
{ "slug": "my-app", "name": "My app", "sourceLocale": "en", "mode": "sdk" }
```

`mode` is `"sdk"` or `"proxy"` (website). Proxy projects require
`siteUrl`. `sourceLocale` defaults to `"en"`. Duplicate slugs → `409`.

#### GET /projects

Paginated list of your projects.

#### GET /projects/:id

The project plus per-locale completion stats (`keyCount`, `approved`,
`machine`, `needsReview`, `missing` per locale), its namespaces, and
the most recent release.

#### PATCH /projects/:id

Update `name` and/or `siteUrl`.

## Locales

#### POST /projects/:id/locales

```json
{ "tag": "pt-BR", "fallback": "pt", "rtl": false }
```

`tag` is a BCP-47 tag. The source locale is implicit — add targets
only. `fallback` builds the resolution chain used by serving and pull.

#### PATCH /projects/:id/locales/:tag

Update `fallback`, `rtl`, or `enabled`.

#### GET /projects/:id/locales

Per-locale completion stats.

## Namespaces

#### POST /projects/:id/namespaces

```json
{ "name": "legal", "reviewPolicy": "gated" }
```

`reviewPolicy` is `"standard"` (default) or `"gated"` — gated
namespaces publish approved translations only. Every project starts
with a `default` namespace; extract auto-creates namespaces it
discovers.

#### PATCH /projects/:id/namespaces/:name

Update `reviewPolicy`.

## Keys

#### PUT /projects/:id/keys

The extract/push endpoint — bulk-upserts up to 2,000 keys:

```json
{
  "keys": [
    {
      "namespace": "default",
      "name": "cart.items",
      "sourceText": "{count, plural, one {# item} other {# items}}",
      "description": "Cart badge label",
      "maxLength": 40,
      "context": { "usages": [{ "file": "src/cart.tsx", "line": 12 }] }
    }
  ],
  "prune": false
}
```

Returns `{ "created": n, "updated": n, "archived": n }`. Declared ICU
placeholders are derived from `sourceText` server-side, so the
placeholder gate can never disagree with the source of truth. With
`"prune": true`, keys in the **same namespaces** that are absent from
the payload are archived — only send it with a complete picture.

#### GET /projects/:id/keys

The workbench list. Filters: `?namespace=`, `?q=` (substring on name /
source text), `?locale=` + `?status=` (translation state for that
locale; `status=missing` selects keys with no translation row),
`?archived=true`. Paginated.

#### PATCH /keys/:keyId

Update key context metadata: `description`, `maxLength`,
`screenshotUrl`.

## Translations

#### PUT /keys/:keyId/translations/:locale

```json
{ "value": "{count, plural, one {# barang} other {# barang}}", "status": "approved" }
```

`status`: `"needs_review"` (default), `"machine"`, or `"approved"`.
The **placeholder-safety gate runs here, on every write** — a value
that drops or renames an ICU placeholder is rejected with
`422 PLACEHOLDER_MISMATCH` and never enters the database. In gated
namespaces, `machine` writes are downgraded to `needs_review`.
Approving feeds the translation memory. The response includes a
`lengthWarning` when the value's estimated display length exceeds the
key's `maxLength`.

#### GET /projects/:id/review-queue

Everything with status `machine` or `needs_review`, oldest first, with
the key context a reviewer needs. Filter `?locale=`. Paginated.

#### POST /translations/:id/approve

Marks approved, records the reviewer, upserts the translation memory.

#### POST /translations/:id/reject

```json
{ "reason": "Wrong register — too formal for a button." }
```

Rejected translations are excluded from publishing and re-queued for
the next agent pass.

## Releases

#### POST /projects/:id/releases

```json
{ "locale": "id" }
```

Builds the publishable catalog for the locale and freezes it as an
immutable, content-hashed release. Approved translations always ship;
`machine` / `needs_review` values ship only from `standard`-policy
namespaces — never from `gated` ones. Publishing identical content
returns the existing release with `"unchanged": true` instead of
creating a duplicate.

#### GET /projects/:id/releases

Release history (`id`, `locale`, `contentHash`, `keyCount`,
`createdBy`, `createdAt`). Filter `?locale=`. Paginated.

#### GET /projects/releases/:releaseId

One release including its frozen catalog.

#### GET /projects/releases/:a/diff/:b

Key-level diff between two releases:

```json
{
  "data": {
    "a": { "id": "rel_xxx", "hash": "…" },
    "b": { "id": "rel_yyy", "hash": "…" },
    "added": ["checkout.title"],
    "removed": [],
    "changed": [{ "key": "cart.items", "from": "…", "to": "…" }]
  },
  "error": null,
  "meta": { "requestId": "req_xxx", "timestamp": "2026-08-01T00:00:00.000Z" }
}
```

## Pull and check

#### GET /projects/:id/pull

What `locavello pull` calls. Returns the source catalog, each enabled
locale's latest released catalog (`?draft=true` includes a draft build
for locales without a release), the fallback map, and — with
`?pseudo=true` — a synthesized `en-XA` catalog (free, generated on the
fly).

#### GET /projects/:id/check

What `locavello check` calls: `{ ok, errors, warnings, stats }` with
mechanical issues only — `missing_key` and `placeholder_mismatch` as
errors; `length_overflow`, `glossary_violation`, and `unreviewed` as
warnings.

## Agent jobs

#### POST /projects/:id/translate

```json
{ "locale": "id" }
```

Queues a machine first pass for every untranslated (or rejected) key in
the locale. Returns the job immediately with an upfront estimate
(`stats.estimatedKeys`, `stats.estimatedWords`) so the cost is visible
before the run. If a job for the locale is already queued or running,
it is returned with `"alreadyQueued": true`.

The estimate is checked against your plan's agent-word budget before
anything is queued — a run that would exceed the words you have left
is rejected with `403 UPGRADE_REQUIRED` (agent words are metered even
during early access; translation-memory hits don't count against the
budget).

#### POST /projects/:id/crawl

Queues a website crawl (proxy-mode projects with a `siteUrl` only).

#### GET /projects/:id/pages

Per-page crawl status: `path`, `status`
(`discovered` / `crawled` / `error`), `keyCount`, `lastCrawledAt`,
`lastError`.

#### GET /projects/:id/jobs · GET /projects/jobs/:jobId

Job history and a single job. Statuses: `queued`, `running`, `done`,
`failed`.

## Glossary

#### POST /glossary

```json
{ "term": "Locavello", "projectId": null, "locale": null, "translation": null }
```

`translation: null` = **do-not-translate**. Set `locale` +
`translation` for a **forced translation** in that locale. `projectId:
null` applies the term account-wide.

#### GET /glossary

All terms; `?projectId=` returns that project's terms plus the
account-wide ones.

#### DELETE /glossary/:id

Remove a term.

## Translation memory

#### GET /tm/suggest?text=&target=

Workbench suggestions for one source text: the exact match (by source
hash) plus up to 5 fuzzy candidates. TM is account-wide — matches come
from **all** your projects.

#### GET /tm/search?q=&target=

Free-text search across source and target text (up to 50 rows).

## API keys

#### POST /api-keys

```json
{ "name": "CI" }
```

Returns the key row plus `plaintext` (`lv_live_xxx`) — **shown once,
store it now**.

#### GET /api-keys

Your keys: `name`, display `prefix`, `lastUsedAt`, `revokedAt`.

#### DELETE /api-keys/:id

Revokes the key (it stops authenticating immediately; the row is kept
for audit display).

## Public endpoints (no auth)

#### POST /public/preview

The homepage's instant preview. No authentication; tightly capped (40
strings / 500 words per run, plus a global daily word budget for the
anonymous surface).

```json
{ "url": "https://example.com", "targetLocale": "id" }
```

Agent runs take longer than proxy timeouts allow, so the preview is
**asynchronous**: the POST fetches the page, extracts its strings, and
dispatches the translation run, then returns `202` in a few seconds:

```json
{
  "data": {
    "previewId": "tj_01jxxxxxxxxxxxxxxxxxxxxxxx",
    "url": "https://example.com/",
    "targetLocale": "id",
    "stringsOnPage": 63,
    "previewedWords": 214
  },
  "error": null,
  "meta": { "requestId": "req_xxx", "timestamp": "2026-08-01T00:00:00.000Z" }
}
```

Failures on the POST:

| Code | Status | Meaning |
|---|---|---|
| `INVALID_URL` | 422 | Not a fetchable public http(s) URL |
| `FETCH_FAILED` | 422 | The page couldn't be fetched |
| `NO_TEXT` | 422 | No translatable text found on the page |
| `PREVIEW_BUDGET_EXHAUSTED` | 503 | The free preview's daily word budget is spent — try again tomorrow |
| `VALIDATION_ERROR` | 400 | Bad input (e.g. `targetLocale` is not a BCP-47 tag) |

#### GET /public/preview/:previewId

Poll the preview (every ~3 seconds is polite). Returns one of:

```json
{ "data": { "status": "running" } }
```

```json
{
  "data": {
    "status": "done",
    "url": "https://example.com/",
    "targetLocale": "id",
    "pairs": [{ "original": "Get started", "translated": "Mulai" }]
  }
}
```

```json
{ "data": { "status": "failed", "error": "…" } }
```

Unknown or non-preview ids return `404 NOT_FOUND`. Runs usually finish
in under a minute.

#### GET /public/projects/:id/catalog?locale=

The serving endpoint for the website snippet. Returns the latest
**published release** for the locale with its fallback chain
pre-flattened, plus `enabledLocales` and `sourceLocale`. CORS-open
(`Access-Control-Allow-Origin: *`) and cacheable (`max-age=60`,
`s-maxage=300`). Drafts are never served.

## Health

#### GET /health

No auth. Service name, version, and dependency checks — the same shape
across every Forjio service.

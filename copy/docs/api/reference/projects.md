---
title: Projects — reference
---

# Projects

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/projects` | [List projects](#list-projects) |
| `POST` | `/api/v1/projects` | [Create a project](#create-a-project) |
| `GET` | `/api/v1/projects/{id}` | [Get a project](#get-a-project) |
| `PATCH` | `/api/v1/projects/{id}` | [Update a project](#update-a-project) |
| `GET` | `/api/v1/projects/{id}/check` | [The CI gate report.](#the-ci-gate-report) |
| `POST` | `/api/v1/projects/{id}/crawl` | [Queue a Mode B crawl of the project's siteUrl.](#queue-a-mode-b-crawl-of-the-projects-siteurl) |
| `GET` | `/api/v1/projects/{id}/jobs` | [List jobs](#list-jobs) |
| `GET` | `/api/v1/projects/{id}/keys` | [The workbench list.](#the-workbench-list) |
| `PUT` | `/api/v1/projects/{id}/keys` | [The extract/push endpoint.](#the-extractpush-endpoint) |
| `GET` | `/api/v1/projects/{id}/locales` | [List locales](#list-locales) |
| `POST` | `/api/v1/projects/{id}/locales` | [Locales a project](#locales-a-project) |
| `PATCH` | `/api/v1/projects/{id}/locales/{tag}` | [Update a locale](#update-a-locale) |
| `POST` | `/api/v1/projects/{id}/namespaces` | [Namespaces a project](#namespaces-a-project) |
| `PATCH` | `/api/v1/projects/{id}/namespaces/{name}` | [Update a namespace](#update-a-namespace) |
| `GET` | `/api/v1/projects/{id}/pages` | [List pages](#list-pages) |
| `GET` | `/api/v1/projects/{id}/pull` | [The CI endpoint.](#the-ci-endpoint) |
| `GET` | `/api/v1/projects/{id}/releases` | [List releases](#list-releases) |
| `POST` | `/api/v1/projects/{id}/releases` | [Publish.](#publish) |
| `GET` | `/api/v1/projects/{id}/review-queue` | [Everything machine-produced or flagged, with the key context the reviewer needs, oldest first.](#everything-machine-produced-or-flagged-with-the-key-context-the-reviewer-needs-oldest-first) |
| `POST` | `/api/v1/projects/{id}/translate` | [Queue a machine first pass for a locale.](#queue-a-machine-first-pass-for-a-locale) |
| `GET` | `/api/v1/projects/jobs/{jobId}` | [Get a job](#get-a-job) |
| `GET` | `/api/v1/projects/releases/{a}/diff/{b}` | [Key-level diff between two releases.](#key-level-diff-between-two-releases) |
| `GET` | `/api/v1/projects/releases/{releaseId}` | [The frozen catalog (Mode B serving + diffs read this).](#the-frozen-catalog-mode-b-serving-diffs-read-this) |

## List projects

```
GET /api/v1/projects
```

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Create a project

```
POST /api/v1/projects
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `slug` | string | yes |  |
| `name` | string | yes | min length 1; max length 200 |
| `sourceLocale` | string | no | default `"en"` |
| `mode` | `sdk` or `proxy` | no | default `"sdk"` |
| `siteUrl` | string (uri) | no | max length 500 |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/projects" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"…","name":"…","sourceLocale":"en","mode":"sdk","siteUrl":"…"}'
```

## Get a project

```
GET /api/v1/projects/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Update a project

```
PATCH /api/v1/projects/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min length 1; max length 200 |
| `siteUrl` | string (uri) | no | max length 500; may be null |

### Example

```bash
curl -X PATCH "https://locavello.forjio.com/api/v1/projects/:id" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","siteUrl":"…"}'
```

## The CI gate report.

```
GET /api/v1/projects/{id}/check
```

GET /projects/:id/check — the CI gate report. Non-empty `errors`
should fail the build. Everything here is mechanical: missing keys
per enabled locale, placeholder mismatches, length overflows, and
glossary violations (do-not-translate terms that got translated
away).

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/check" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Queue a Mode B crawl of the project's siteUrl.

```
POST /api/v1/projects/{id}/crawl
```

POST /projects/:id/crawl — queue a Mode B crawl of the project's
siteUrl. Strings land in the 'site' namespace; pages in SitePage.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/projects/:id/crawl" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## List jobs

```
GET /api/v1/projects/{id}/jobs
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/jobs" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## The workbench list.

```
GET /api/v1/projects/{id}/keys
```

GET /projects/:id/keys — the workbench list. Filters: namespace,
q (substring on name/sourceText), locale+status (translation state
for a locale, status=missing means no row).

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `archived` | any | no |  |
| `locale` | any | no |  |
| `namespace` | any | no |  |
| `q` | any | no |  |
| `status` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/keys" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## The extract/push endpoint.

```
PUT /api/v1/projects/{id}/keys
```

PUT /projects/:id/keys — the extract/push endpoint. Bulk-upserts keys
with source text + context; declared ICU placeholders are derived from
the source text server-side so the placeholder-safety gate can never
disagree with the source of truth.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `keys` | array of object | yes |  |
| `prune` | boolean | no | default `false` |

### Example

```bash
curl -X PUT "https://locavello.forjio.com/api/v1/projects/:id/keys" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"keys":[],"prune":false}'
```

## List locales

```
GET /api/v1/projects/{id}/locales
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/locales" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Locales a project

```
POST /api/v1/projects/{id}/locales
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `tag` | string | yes |  |
| `fallback` | string | no | may be null |
| `rtl` | boolean | no | default `false` |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/projects/:id/locales" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"tag":"…","fallback":"…","rtl":false}'
```

## Update a locale

```
PATCH /api/v1/projects/{id}/locales/{tag}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `tag` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `fallback` | string | no | may be null |
| `rtl` | boolean | no |  |
| `enabled` | boolean | no |  |

### Example

```bash
curl -X PATCH "https://locavello.forjio.com/api/v1/projects/:id/locales/:tag" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"fallback":"…","rtl":false,"enabled":false}'
```

## Namespaces a project

```
POST /api/v1/projects/{id}/namespaces
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes |  |
| `reviewPolicy` | `standard` or `gated` | no | default `"standard"` |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/projects/:id/namespaces" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"…","reviewPolicy":"standard"}'
```

## Update a namespace

```
PATCH /api/v1/projects/{id}/namespaces/{name}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `name` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reviewPolicy` | `standard` or `gated` | yes |  |

### Example

```bash
curl -X PATCH "https://locavello.forjio.com/api/v1/projects/:id/namespaces/:name" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"reviewPolicy":"standard"}'
```

## List pages

```
GET /api/v1/projects/{id}/pages
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/pages" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## The CI endpoint.

```
GET /api/v1/projects/{id}/pull
```

GET /projects/:id/pull — the CI endpoint. Returns, per enabled
locale, the latest release's catalog (or a draft build when no
release exists yet and ?draft=true). Also returns the source-locale
key list so the CLI can emit locavello.d.ts. `en-XA` (pseudo) is
synthesized on the fly from source text — no account cost.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `draft` | any | no |  |
| `pseudo` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/pull" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## List releases

```
GET /api/v1/projects/{id}/releases
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `locale` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/releases" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Publish.

```
POST /api/v1/projects/{id}/releases
```

POST /projects/:id/releases — publish. Idempotent on content: same
catalog → the existing release is returned, no new row.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `locale` | string | yes | min length 2 |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/projects/:id/releases" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"locale":"…"}'
```

## Everything machine-produced or flagged, with the key context the reviewer needs, oldest first.

```
GET /api/v1/projects/{id}/review-queue
```

GET /projects/:id/review-queue — everything machine-produced or
flagged, with the key context the reviewer needs, oldest first.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `locale` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/:id/review-queue" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Queue a machine first pass for a locale.

```
POST /api/v1/projects/{id}/translate
```

POST /projects/:id/translate — queue a machine first pass for a
locale. Returns the job immediately with an upfront word ESTIMATE
(untranslated source words) so the cost is visible before the run —
the worker refines stats as it goes.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `locale` | string | yes | min length 2 |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/projects/:id/translate" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"locale":"…"}'
```

## Get a job

```
GET /api/v1/projects/jobs/{jobId}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `jobId` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/jobs/:jobId" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Key-level diff between two releases.

```
GET /api/v1/projects/releases/{a}/diff/{b}
```

GET /releases/:a/diff/:b — key-level diff between two releases.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `a` | string | yes |  |
| `b` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/releases/:a/diff/:b" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## The frozen catalog (Mode B serving + diffs read this).

```
GET /api/v1/projects/releases/{releaseId}
```

GET /releases/:id — the frozen catalog (Mode B serving + diffs read this).

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `releaseId` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/projects/releases/:releaseId" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

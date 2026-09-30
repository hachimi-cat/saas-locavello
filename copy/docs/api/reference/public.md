---
title: Public — reference
---

# Public

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/v1/public/preview` | [Create a preview](#create-a-preview) |
| `GET` | `/api/v1/public/preview/{id}` | [Poll a preview.](#poll-a-preview) |
| `GET` | `/api/v1/public/projects/{id}/catalog` | [What locavello.js consumes.](#what-locavellojs-consumes) |

## Create a preview

```
POST /api/v1/public/preview
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | min length 4; max length 2000 |
| `targetLocale` | string | no | default `"id"` |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/public/preview" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"…","targetLocale":"id"}'
```

## Poll a preview.

```
GET /api/v1/public/preview/{id}
```

GET /preview/:id — poll a preview. previewId is an unguessable ULID;
returns {status: 'running'|'done'|'failed', pairs?} and finalizes the
job row on the first terminal poll.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/public/preview/:id" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## What locavello.js consumes.

```
GET /api/v1/public/projects/{id}/catalog
```

GET /projects/:id/catalog?locale=xx — what locavello.js consumes.
Serves the latest published release for the locale (plus its
fallback chain, pre-flattened so the client does zero logic).

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
curl -X GET "https://locavello.forjio.com/api/v1/public/projects/:id/catalog" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

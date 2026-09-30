---
title: Keys — reference
---

# Keys

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `PATCH` | `/api/v1/keys/{keyId}` | [Context metadata edits from the workbench.](#context-metadata-edits-from-the-workbench) |
| `PUT` | `/api/v1/keys/{keyId}/translations/{locale}` | [Write a translation.](#write-a-translation) |

## Context metadata edits from the workbench.

```
PATCH /api/v1/keys/{keyId}
```

PATCH /keys/:keyId — context metadata edits from the workbench.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `keyId` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `description` | string | no | max length 2000; may be null |
| `maxLength` | integer | no | above 0; may be null |
| `screenshotUrl` | string (uri) | no | max length 1000; may be null |

### Example

```bash
curl -X PATCH "https://locavello.forjio.com/api/v1/keys/:keyId" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"description":"…","maxLength":0,"screenshotUrl":"…"}'
```

## Write a translation.

```
PUT /api/v1/keys/{keyId}/translations/{locale}
```

PUT /keys/:keyId/translations/:locale — write a translation. The
placeholder-safety gate is enforced HERE, mechanically, on every
write: a translation that drops or renames an ICU placeholder never
enters the database.

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `keyId` | string | yes |  |
| `locale` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `value` | string | yes | max length 20000 |
| `status` | `machine` or `needs_review` or `approved` | no | default `"needs_review"` |
| `author` | string | no | max length 200 |

### Example

```bash
curl -X PUT "https://locavello.forjio.com/api/v1/keys/:keyId/translations/:locale" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"value":"…","status":"needs_review","author":"…"}'
```

---
title: Translations — reference
---

# Translations

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `POST` | `/api/v1/translations/{id}/approve` | [Approve a translation](#approve-a-translation) |
| `POST` | `/api/v1/translations/{id}/reject` | [Reject a translation](#reject-a-translation) |

## Approve a translation

```
POST /api/v1/translations/{id}/approve
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/translations/:id/approve" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Reject a translation

```
POST /api/v1/translations/{id}/reject
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | yes | min length 1; max length 2000 |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/translations/:id/reject" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"reason":"…"}'
```

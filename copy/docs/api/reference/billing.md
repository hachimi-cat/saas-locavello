---
title: Billing — reference
---

# Billing

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/billing` | [List billing](#list-billing) |
| `POST` | `/api/v1/billing/checkout` | [Create a checkout](#create-a-checkout) |

## List billing

```
GET /api/v1/billing
```

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/billing" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Create a checkout

```
POST /api/v1/billing/checkout
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `tier` | `free` or `starter` or `pro` or `scale` | yes |  |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/billing/checkout" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"tier":"free"}'
```

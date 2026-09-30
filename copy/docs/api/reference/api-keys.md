---
title: Api keys — reference
---

# Api keys

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/api-keys` | [List api keys](#list-api-keys) |
| `POST` | `/api/v1/api-keys` | [Mint `lv_live_…`.](#mint-lvlive) |
| `DELETE` | `/api/v1/api-keys/{id}` | [Delete an api key](#delete-an-api-key) |

## List api keys

```
GET /api/v1/api-keys
```

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/api-keys" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Mint `lv_live_…`.

```
POST /api/v1/api-keys
```

POST /api-keys — mint `lv_live_…`. The plaintext is returned ONCE and
stored only as a sha256 hash; the prefix column powers "lv_live_ab…"
display.

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | min length 1; max length 100 |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/api-keys" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"…"}'
```

## Delete an api key

```
DELETE /api/v1/api-keys/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://locavello.forjio.com/api/v1/api-keys/:id" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

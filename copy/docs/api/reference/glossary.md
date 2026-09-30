---
title: Glossary — reference
---

# Glossary

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/glossary` | [List glossary](#list-glossary) |
| `POST` | `/api/v1/glossary` | [Create a glossary](#create-a-glossary) |
| `DELETE` | `/api/v1/glossary/{id}` | [Delete a glossary](#delete-a-glossary) |
| `PATCH` | `/api/v1/glossary/{id}` | [Update a glossary](#update-a-glossary) |

## List glossary

```
GET /api/v1/glossary
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `projectId` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/glossary" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Create a glossary

```
POST /api/v1/glossary
```

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `term` | string | yes | min length 1; max length 200 |
| `projectId` | string | no | may be null |
| `locale` | string | no | may be null |
| `translation` | string | no | max length 500; may be null |
| `note` | string | no | max length 1000; may be null |

### Example

```bash
curl -X POST "https://locavello.forjio.com/api/v1/glossary" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"term":"…","projectId":"…","locale":"…","translation":"…","note":"…"}'
```

## Delete a glossary

```
DELETE /api/v1/glossary/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Example

```bash
curl -X DELETE "https://locavello.forjio.com/api/v1/glossary/:id" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Update a glossary

```
PATCH /api/v1/glossary/{id}
```

### Path parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |

### Body

| Field | Type | Required | Notes |
|---|---|---|---|
| `term` | string | no | min length 1; max length 200 |
| `projectId` | string | no | may be null |
| `locale` | string | no | may be null |
| `translation` | string | no | max length 500; may be null |
| `note` | string | no | max length 1000; may be null |

### Example

```bash
curl -X PATCH "https://locavello.forjio.com/api/v1/glossary/:id" \
  -H "Authorization: Bearer lv_live_<your API key>" \
  -H "Content-Type: application/json" \
  -d '{"term":"…","projectId":"…","locale":"…","translation":"…","note":"…"}'
```

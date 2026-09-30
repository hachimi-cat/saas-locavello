---
title: Audit — reference
---

# Audit

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/audit` | [List audit](#list-audit) |

## List audit

```
GET /api/v1/audit
```

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `action` | any | no |  |
| `actor` | any | no |  |
| `q` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/audit" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

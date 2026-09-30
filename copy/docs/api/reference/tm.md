---
title: Tm — reference
---

# Tm

Generated from Locavello's own code: every route in this area, what it takes and how to call it.

| Method | Path | What it does |
|---|---|---|
| `GET` | `/api/v1/tm` | [Browse the whole memory, newest-first, cursor-paged.](#browse-the-whole-memory-newest-first-cursor-paged) |
| `GET` | `/api/v1/tm/search` | [The TM screen's cross-project search.](#the-tm-screens-cross-project-search) |
| `GET` | `/api/v1/tm/suggest` | [Workbench + agent suggestions.](#workbench-agent-suggestions) |

## Browse the whole memory, newest-first, cursor-paged.

```
GET /api/v1/tm
```

GET /tm — browse the whole memory, newest-first, cursor-paged. The
TM screen lists this on load (742 entries must not hide behind a
search box); `target` narrows to one locale.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `target` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/tm" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## The TM screen's cross-project search.

```
GET /api/v1/tm/search
```

GET /tm/search?q=&target= — the TM screen's cross-project search.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `q` | any | no |  |
| `target` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/tm/search" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

## Workbench + agent suggestions.

```
GET /api/v1/tm/suggest
```

GET /tm/suggest?text=&target= — workbench + agent suggestions.
Exact match first (sourceHash), then substring candidates. The
cross-project reuse this enables is the compounding asset the whole
product is built around.

### Query parameters

| Name | Type | Required | Notes |
|---|---|---|---|
| `target` | any | no |  |
| `text` | any | no |  |

### Example

```bash
curl -X GET "https://locavello.forjio.com/api/v1/tm/suggest" \
  -H "Authorization: Bearer lv_live_<your API key>"
```

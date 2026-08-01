# forjio-locavello

Typed Python client for the [locavello.forjio.com](https://locavello.forjio.com) localization REST API.

```bash
pip install forjio-locavello
```

```python
from forjio_locavello import LocavelloClient, paginate

# Bearer token from api_key= or the LOCAVELLO_API_KEY env var — use an
# lv_live_... API key from Dashboard -> Settings -> API keys.
client = LocavelloClient(api_key="lv_live_xxx")

# Projects — create, browse, locales + namespaces
project = client.projects.create(slug="marketing-site", name="Marketing Site")
page = client.projects.list(limit=20)  # {"data", "cursor", "has_more"}
detail = client.projects.get(project["id"])  # + locale stats, namespaces, lastRelease
client.projects.add_locale(project["id"], tag="id", fallback="en")
client.projects.update_locale(project["id"], "id", enabled=True)
stats = client.projects.locales(project["id"])  # plain array, not a Page
client.projects.add_namespace(project["id"], name="checkout", review_policy="gated")

# Keys — bulk-sync source strings (max 2000 per request), then browse
result = client.keys.upsert(
    project["id"],
    keys=[
        {"name": "cta.title", "sourceText": "Get started"},
        {"namespace": "checkout", "name": "pay.button", "sourceText": "Pay now", "maxLength": 12},
    ],
    prune=True,
)  # {"created", "updated", "archived"}
for key in paginate(lambda c: client.keys.list(project["id"], status="missing", cursor=c)):
    print(key["name"])

# Translations — set values, work the review queue
client.translations.set("key_...", "id", value="Mulai sekarang", status="needs_review")
queue = client.translations.review_queue(project["id"], locale="id")
client.translations.approve(queue["data"][0]["id"])
client.translations.reject("trn_...", reason="Wrong tone")

# Releases — publish per locale, pull catalogs, gate CI
release = client.releases.publish(project["id"], locale="id")
bundle = client.releases.pull(project["id"])  # all released catalogs + fallbacks
check = client.releases.check(project["id"])  # {"ok", "errors", "warnings", "stats"}
diff = client.releases.diff(release["id"], "rel_previous")

# Jobs — machine translate + site crawl
job = client.jobs.translate(project["id"], locale="id")
job = client.jobs.get(job["id"])  # poll: queued | running | done | failed
client.jobs.crawl(project["id"])  # proxy-mode projects
pages = client.jobs.pages(project["id"])

# Glossary + translation memory
client.glossary.create(term="Forjio")  # no translation = do-not-translate
client.glossary.create(term="checkout", locale="id", translation="pembayaran")
tm = client.tm.suggest(text="Get started", target="id")  # {"exact", "fuzzy"}
hits = client.tm.search(q="started", target="id")

# API keys + billing
minted = client.api_keys.create(name="ci")  # plaintext shown once
info = client.billing.get()
out = client.billing.checkout("pro")  # redirect the browser to out["hostedUrl"]

# Public surface — no api key required, never sends Authorization
preview = client.public.preview(url="https://example.com", target_locale="id")
result = client.public.preview_result(preview["previewId"])
catalog = client.public.catalog(project["id"], locale="id")
```

## Endpoints covered

| Namespace | Methods |
| --- | --- |
| `projects` | `create`, `list`, `get`, `update` (nullable `site_url`), `add_locale`, `update_locale`, `locales`, `add_namespace`, `update_namespace` |
| `keys` | `upsert` (bulk sync + `prune`), `list` (namespace / q / locale / status / archived / limit / cursor) |
| `translations` | `update_key`, `set` (value + status + author, returns `lengthWarning`), `review_queue`, `approve`, `reject` |
| `releases` | `publish`, `list`, `get`, `pull` (`draft` / `pseudo`), `check`, `diff` |
| `jobs` | `translate`, `crawl`, `pages`, `list`, `get` |
| `glossary` | `create`, `list`, `delete` |
| `tm` | `suggest(text, target)`, `search(q, target)` |
| `api_keys` | `create`, `list`, `revoke` |
| `billing` | `get` (subscription + usage + tier table), `checkout(tier)` -> hosted checkout URL |
| `public` | `preview`, `preview_result`, `catalog` (no api key) |

List methods return a Page dict `{"data", "cursor", "has_more"}`;
`paginate(fetch)` walks every page of any list method. Idempotent GETs
are retried automatically (max 2) on HTTP 429/502/503/504 and network
errors with exponential backoff from `retry_base_ms`.

Errors raise `LocavelloError` carrying the API envelope's `error.code`
(`NOT_FOUND`, `VALIDATION_ERROR`, `AUTH_REQUIRED`, ...), the HTTP
status, and the `meta.requestId`.

## Family

Sister to:
- [`@forjio/locavello`](https://www.npmjs.com/package/@forjio/locavello) (JS/TS)
- [`hachimi-cat/locavello-go`](https://github.com/hachimi-cat/locavello-go) (Go)

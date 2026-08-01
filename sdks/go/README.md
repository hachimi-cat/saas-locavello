# locavello-go

Typed Go client for the [Locavello](https://locavello.forjio.com)
localization platform REST API — projects, keys, translations, review,
releases, agent jobs, glossary, translation memory, and the public
Mode B preview/catalog surface.

Current version: **v0.1.0**.

```bash
go get github.com/hachimi-cat/locavello-go
```

```go
import (
	"context"
	"fmt"

	locavello "github.com/hachimi-cat/locavello-go"
)

// Bearer key from Config.APIKey or the LOCAVELLO_API_KEY env var — an
// lv_live_… API key from Dashboard → API keys.
c := locavello.New(locavello.Config{APIKey: "lv_live_xxx"})
ctx := context.Background()

// Projects
prj, err := c.Projects.Create(ctx, locavello.ProjectCreateInput{Slug: "my-site", Name: "My Site"})
fallback := "en"
_, err = c.Projects.AddLocale(ctx, prj.ID, locavello.LocaleAddInput{Tag: "id", Fallback: &fallback})
stats, err := c.Projects.Locales(ctx, prj.ID) // plain array, not a Page

// Keys — extract/push (max 2000 keys per request)
res, err := c.Keys.Upsert(ctx, prj.ID, locavello.KeyUpsertInput{
	Keys:  []locavello.KeyInput{{Name: "hero.title", SourceText: "Ship in every language"}},
	Prune: true, // extract sends the complete picture of a namespace
})
missing := locavello.StatusMissing
page, err := c.Keys.List(ctx, prj.ID, &locavello.KeyListParams{Locale: &[]string{"id"}[0], Status: &missing})

// Auto-pagination — Paginate walks cursor/hasMore and collects all.
all, err := locavello.Paginate(ctx, func(ctx context.Context, cursor *string) (*locavello.Page[locavello.Key], error) {
	return c.Keys.List(ctx, prj.ID, &locavello.KeyListParams{Cursor: cursor})
})

// Translations + review
set, err := c.Translations.Set(ctx, page.Data[0].ID, "id", locavello.TranslationSetInput{
	Value: "Rilis dalam semua bahasa", Status: locavello.StatusApproved,
})
queue, err := c.Translations.ReviewQueue(ctx, prj.ID, nil)
_, err = c.Translations.Approve(ctx, queue.Data[0].ID)
_, err = c.Translations.Reject(ctx, queue.Data[1].ID, "tone is off")

// Agent machine pass + job polling
job, err := c.Jobs.Translate(ctx, prj.ID, "id")
job, err = c.Jobs.Get(ctx, job.ID) // "queued" | "running" | "done" | "failed"

// Releases — publish, pull (CI), check (CI gate), diff
rel, err := c.Releases.Publish(ctx, prj.ID, "id")
pull, err := c.Releases.Pull(ctx, prj.ID, &locavello.PullParams{Pseudo: true})
report, err := c.Releases.Check(ctx, prj.ID) // fail the build on len(report.Errors) > 0
diff, err := c.Releases.Diff(ctx, "rel_old", rel.ID)

// Glossary + translation memory
dnt := "Locavello"
_, err = c.Glossary.Create(ctx, locavello.GlossaryCreateInput{Term: dnt}) // do-not-translate
sug, err := c.TM.Suggest(ctx, "Ship in every language", "id")
hits, err := c.TM.Search(ctx, "language", nil)

// API keys + billing
key, err := c.APIKeys.Create(ctx, "ci") // key.Plaintext is shown ONCE
info, err := c.Billing.Get(ctx)
out, err := c.Billing.Checkout(ctx, locavello.TierStarter) // redirect the browser to out.HostedURL

// Public (unauthenticated) surface — no API key required
prev, err := c.Public.Preview(ctx, locavello.PreviewInput{URL: "https://example.com", TargetLocale: "id"})
status, err := c.Public.PreviewResult(ctx, prev.PreviewID)
cat, err := c.Public.Catalog(ctx, prj.ID, "id")
fmt.Println(cat.Catalog["default:hero.title"])
```

## Endpoints covered

| Resource | Methods |
| --- | --- |
| `Projects` | `Create`, `List`, `Get` (detail + locale stats + namespaces + last release), `Update`, `AddLocale`, `UpdateLocale`, `Locales` (plain array), `AddNamespace`, `UpdateNamespace` |
| `Keys` | `Upsert` (bulk extract/push, `Prune`), `List` (Namespace / Q / Locale / Status / Archived / Limit / Cursor) |
| `Translations` | `UpdateKey`, `Set` (placeholder-safety gated, returns `LengthWarning`), `ReviewQueue`, `Approve`, `Reject` |
| `Releases` | `Publish` (content-idempotent), `List`, `Get`, `Pull` (CI catalogs + `Draft`/`Pseudo`), `Check` (CI gate), `Diff` |
| `Jobs` | `Translate`, `Crawl`, `Pages`, `List`, `Get` |
| `Glossary` | `Create` (forced translation / do-not-translate), `List`, `Delete` |
| `TM` | `Suggest` (exact + fuzzy), `Search` |
| `APIKeys` | `Create` (plaintext shown once), `List`, `Revoke` |
| `Billing` | `Get` (subscription + usage + tier table), `Checkout(tier)` → hosted checkout URL |
| `Public` | `Preview`, `PreviewResult`, `Catalog` (no API key, no Authorization header) |

List endpoints return `Page[T]{Data, Cursor, HasMore}` read from the
envelope's `meta`; `Paginate` loops `cursor`/`hasMore` and collects
every item (loop pages manually if you want streaming).

Idempotent **GET** requests are retried automatically on HTTP 429 /
502 / 503 / 504 and transport errors — max 2 retries, exponential
backoff from `Config.RetryBaseMs` (default 250ms). Non-GET requests
are never retried.

Failures return `*locavello.Error` carrying the API envelope's
`error.code` (`NOT_FOUND`, `VALIDATION_ERROR`, `PLACEHOLDER_MISMATCH`,
`UPGRADE_REQUIRED`, …), the HTTP status, and the `meta.requestId`.
Authed calls with no key configured fail fast with `AUTH_REQUIRED`
before any request is made.

## Family

Sister to:
- [`@forjio/locavello`](https://www.npmjs.com/package/@forjio/locavello) (JS/TS)
- [`forjio-locavello`](https://pypi.org/project/forjio-locavello/) (Python)

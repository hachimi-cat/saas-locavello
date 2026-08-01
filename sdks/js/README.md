# @forjio/locavello

Typed JS/TS client for the [Locavello](https://locavello.forjio.com) REST API —
extract keys, drive translations, publish releases, and pull catalogs in CI.

```bash
npm install @forjio/locavello
```

```ts
import { LocavelloClient, paginate } from '@forjio/locavello';

const client = new LocavelloClient({ apiKey: process.env.LOCAVELLO_API_KEY! });

// Pull released catalogs (the CI endpoint)
const { source, locales } = await client.releases.pull('prj_…');

// Gate a release
const report = await client.releases.check('prj_…');
if (!report.ok) process.exit(1);

// Walk every key
for await (const key of paginate((cursor) => client.keys.list('prj_…', { cursor }))) {
  console.log(key.name);
}
```

- Auth: `Authorization: Bearer lv_live_…` (pass `apiKey` or set `LOCAVELLO_API_KEY`).
  The `public.*` surface (Mode B preview + catalog serving) needs no key.
- Every response rides the Forjio envelope `{ data, error, meta }`; failures throw
  `LocavelloError` with `{ status, code, message, requestId, param }`.
- Idempotent GETs retry automatically on 429/502/503/504 + network errors
  (2 retries, exponential backoff). Writes never retry.

See [locavello.forjio.com/docs/sdk/js](https://locavello.forjio.com/docs/sdk/js)
for the full method reference.

## Family

Sister to:
- [`forjio-locavello`](https://pypi.org/project/forjio-locavello/) (Python)
- [`hachimi-cat/locavello-go`](https://github.com/hachimi-cat/locavello-go) (Go)

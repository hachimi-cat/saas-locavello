---
title: "CLI reference"
---

# CLI reference

```bash
npm i -g @forjio/locavello-cli
locavello --help
```

The CLI drives the SDK-mode loop: scaffold config, extract keys, pull
released catalogs, check release-readiness, and generate the
pseudo-locale. Commands that talk to the engine authenticate with an
`lv_live_` API key; `pseudo` and a plain `extract` run fully offline.

## Configuration

### locavello.json

Written by `locavello init`, committed to your repo, discovered by
walking up from the current directory:

```json
{
  "project": "prj_01jxxxxxxxxxxxxxxxxxxxxxxx",
  "apiUrl": "https://locavello.forjio.com",
  "sourceLocale": "en",
  "messagesDir": "messages",
  "extract": {
    "globs": ["src/**/*.{ts,tsx}"],
    "tFunctions": ["t"]
  }
}
```

| Field | Default | Meaning |
|---|---|---|
| `project` | — | Project id (`prj_…`) |
| `apiUrl` | — | Engine origin, e.g. `https://locavello.forjio.com` |
| `sourceLocale` | `en` | The locale your source strings are written in |
| `messagesDir` | `messages` | Where catalog files live, relative to `locavello.json` |
| `extract.globs` | `["src/**/*.{ts,tsx}"]` | Files to scan for t-calls |
| `extract.tFunctions` | `["t"]` | Function names treated as translation calls |

### Authentication

The API key is deliberately **not** part of `locavello.json`, so it can
never land in a repo. Resolution order: the `--api-key` flag beats the
`LOCAVELLO_API_KEY` environment variable. Commands that need the engine
fail with a clear message when neither is set.

---

## locavello init

Scaffold `locavello.json` plus an empty source catalog. Fails if
`locavello.json` already exists.

```bash
locavello init --project prj_01jxxx… --api-url https://locavello.forjio.com
```

| Flag | Required | Default | Meaning |
|---|---|---|---|
| `--project <id>` | yes | — | Locavello project id (`prj_…`) |
| `--api-url <url>` | yes | — | Engine origin |
| `--source <locale>` | no | `en` | Source locale |
| `--messages-dir <dir>` | no | `messages` | Messages directory |

## locavello extract

Scan the configured globs for t-calls and merge the found keys into
`<messagesDir>/<sourceLocale>.json`. With `--push`, upsert them to the
engine (batched, 500 keys per request; the server caps a single upsert
at 2,000 keys).

```bash
locavello extract            # local scan + merge only
locavello extract --push     # also upsert to the engine
locavello extract --push --prune
```

| Flag | Default | Meaning |
|---|---|---|
| `--push` | off | `PUT` the extracted keys to the engine |
| `--prune` | off | Archive server keys absent from this extraction (per namespace). Prune is only applied when the whole extraction fits in one request (≤ 2,000 keys) — a partial payload must never archive keys it simply didn't include. Without `--push`, prune only affects the local catalog. |
| `--api-key <key>` | `LOCAVELLO_API_KEY` | API key |

### The namespace rule

A namespace comes **only** from an explicit `ns:key` colon form:

```ts
t('marketing:hero.title')  // namespace 'marketing', key 'hero.title'
t('marketing.hero.title')  // 'default' namespace — dots NEVER split
t('Create link')           // 'default' namespace, source text as the key
```

The colon splits only when the part before it matches the namespace
pattern (`^[a-z][a-z0-9_-]{0,63}$`) and the part after has no
whitespace — so prose like `t('Error: {msg}')` stays a plain key.

### What extract can't extract

- Template literals with `${…}` interpolation — reported as a warning
  with file and line; use a static key with ICU values instead.
- A string literal followed by a dynamic expression in the same
  argument position — reported and skipped.
- Keys longer than 2,000 characters — skipped with a warning on push.

For namespaced keys (`ns:key`), the key name isn't the copy, so extract
records an empty source text and warns until you fill the value in the
source catalog.

## locavello pull

Download released catalogs and regenerate typings.

```bash
locavello pull
locavello pull --draft --pseudo
```

| Flag | Default | Meaning |
|---|---|---|
| `--draft` | off | For locales with **no release yet**, include the current draft build instead of skipping them |
| `--pseudo` | off | Also fetch the synthesized `en-XA` pseudo-locale |
| `--api-key <key>` | `LOCAVELLO_API_KEY` | API key |

Writes:

- `<messagesDir>/<locale>.json` per enabled locale (latest release)
- `<messagesDir>/<sourceLocale>.json` — the source catalog
- `<messagesDir>/_meta.json` — release ids, content hashes, fallback
  map, and the pull timestamp
- `locavello.d.ts` — a `LocavelloKey` string-literal union of every
  key, plus the declaration-merging block that narrows
  `@forjio/locavello-next`'s `t()` key parameter

Catalog files are emitted sorted with stable formatting, so diffs stay
minimal.

## locavello status

Per-locale completion, straight off the project.

```bash
locavello status
locavello status --json
```

| Flag | Meaning |
|---|---|
| `--json` | Machine-readable output |
| `--api-key <key>` | API key |

Table columns: `LOCALE · KEYS · APPROVED · MACHINE · NEEDS_REVIEW ·
MISSING · COMPLETE`.

## locavello check

The CI gate. Exits `1` when there are errors; with `--strict`, warnings
fail too.

```bash
locavello check
locavello check --strict --json
```

| Flag | Meaning |
|---|---|
| `--strict` | Also fail on warnings |
| `--json` | Machine-readable report |
| `--api-key <key>` | API key |

| Issue | Severity | Meaning |
|---|---|---|
| `missing_key` | error | No translation (or only a rejected one) for an enabled locale |
| `placeholder_mismatch` | error | Translation drops or invents ICU placeholders |
| `length_overflow` | warning | Estimated display length exceeds the key's `maxLength` budget |
| `glossary_violation` | warning | A do-not-translate term was translated away |
| `unreviewed` | warning | Translation is still `machine` or `needs_review` |

## locavello pseudo

Generate the `en-XA` pseudo-locale **locally — no network, no cost**.
Reads the source catalog and writes `<messagesDir>/en-XA.json` using
the same algorithm as the server: accented, ~30% padded, bracketed,
with ICU placeholders left intact.

```bash
locavello pseudo
# "Save changes" → "[Ŝàṽé çĥàñĝéŝ~~~~]"
```

Run your app under `en-XA` to spot hardcoded strings (they stay
unaccented) and tight layouts (padding overflows) before paying for a
single translation.

---

## Exit codes and errors

Commands exit `0` on success and `1` on failure. Engine errors print as
`CODE: message` from the API's error envelope (for example
`INVALID_API_KEY: unknown or revoked API key`).

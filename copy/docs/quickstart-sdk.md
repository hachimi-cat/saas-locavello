---
title: "Quick start — SDK"
---

# Quick start — SDK mode

Take a Next.js app from zero to a released second language, with the
catalogs committed to your repo. At runtime your app never calls
Locavello — worst case is always your source language.

## 1. Create a project and an API key

1. [Sign up](/signup) and create a project in the dashboard (SDK mode).
   Note its id — it looks like `prj_01jxxxxxxxxxxxxxxxxxxxxxxx`.
2. In **Dashboard → Developers**, create an API key. The plaintext
   (`lv_live_xxx…`) is shown **once** — store it as a secret. Locavello
   keeps only a hash.

```bash
export LOCAVELLO_API_KEY=lv_live_xxx
```

The key authenticates the CLI and the REST API. It is never written to
any file the CLI creates.

## 2. Install the CLI and initialize

```bash
npm i -g @forjio/locavello-cli

locavello init \
  --project prj_01jxxxxxxxxxxxxxxxxxxxxxxx \
  --api-url https://locavello.forjio.com
```

`init` writes two files:

- `locavello.json` — project id, API origin, source locale (`en` by
  default), messages directory (`messages/` by default), and the
  extract configuration (globs + t-function names).
- `messages/en.json` — your (initially empty) source catalog.

Both are meant to be committed.

## 3. Wrap your strings

Install the runtime and use `t()`:

```bash
npm i @forjio/locavello-next
```

```tsx
'use client';
import { useT } from '@forjio/locavello-next';

export function Toolbar() {
  const t = useT();
  return (
    <>
      <button>{t('Create link')}</button>
      <p>{t('cart.items', { count: 3 })}</p>
    </>
  );
}
```

Two styles work, and mix freely:

- **Source-text-as-key** — `t('Create link')`: the English copy *is*
  the key. Nothing else to maintain.
- **Named keys** — `t('cart.items')`: you fill in the source text in
  `messages/en.json`. Dots do **not** create namespaces; an explicit
  colon does (`t('marketing:hero.title')`). See
  [Concepts → Keys and namespaces](/docs/concepts#keys-and-namespaces).

## 4. Extract and push

```bash
locavello extract --push
```

`extract` scans your configured globs (default `src/**/*.{ts,tsx}`)
for `t()` calls, merges the keys into `messages/en.json`, and `--push`
upserts them to your project. Template literals with `${…}`
interpolation are unextractable and reported as warnings — use a static
key with ICU values instead.

## 5. Add a locale and translate

In the dashboard, add a target locale to the project (for example
`id`), then queue an **agent first pass** — the word cost is estimated
before the run. The agent's output lands as `machine` /
`needs review`, and every write passes the
[placeholder-safety gate](/docs/placeholder-safety). Review in the
workbench, approve what's good, reject what isn't
([review workflow](/docs/review-workflow)).

## 6. Publish and pull

Publish a release for the locale in the dashboard (or via
[`POST /projects/:id/releases`](/docs/api-reference#releases)). Then:

```bash
locavello pull
```

`pull` writes, per enabled locale:

- `messages/<locale>.json` — the latest **released** catalog
- `messages/en.json` — the source catalog
- `messages/_meta.json` — release ids, content hashes, fallbacks
- `locavello.d.ts` — a union type of your real keys, which narrows
  `t()`'s key parameter so typos fail type-check

Commit all of it. Your app now ships translations with **no runtime
dependency on Locavello**.

## 7. Wire the runtime

```tsx
// app/[locale]/layout.tsx
import { LocavelloProvider } from '@forjio/locavello-next';
import en from '@/messages/en.json';
import id from '@/messages/id.json';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <LocavelloProvider locale={locale} catalogs={{ en, id }} sourceLocale="en">
      {children}
    </LocavelloProvider>
  );
}
```

Server components use the pure `/server` entry instead — see the
[Next.js adapter guide](/docs/nextjs-adapter).

## 8. Gate your CI

```bash
locavello check          # exit 1 on missing keys / placeholder mismatches
locavello check --strict # also fail on warnings (lengths, unreviewed, glossary)
```

And before you pay for a single translation, smoke-test your layouts
with the free offline pseudo-locale:

```bash
locavello pseudo         # writes messages/en-XA.json locally
```

Run your app under `en-XA` — hardcoded strings stay unaccented and
tight layouts overflow visibly. Full command details:
[CLI reference](/docs/cli-reference).

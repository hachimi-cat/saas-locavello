---
title: "Introduction"
---

# Locavello Docs

Locavello is a localization platform: extract your product's strings,
let an agent produce the first translation pass, review what matters,
and ship in every language. Translators and reviewers are free seats on
every tier — you pay for projects, keys, and agent words, never for
people.

## Two modes, one engine

**SDK mode** — for your codebase. Wrap strings with `t()`, run
[`locavello extract`](/docs/cli-reference#locavello-extract) to push
them, and [`locavello pull`](/docs/cli-reference#locavello-pull) to
commit the released catalogs — plus a generated `locavello.d.ts` that
makes every key typed and autocompleted. Catalogs live in your repo, so
your app has **zero runtime dependency on Locavello**. Start here:
[Quick start — SDK](/docs/quickstart-sdk).

**Website mode** — for your website, no code changes. Paste a URL on
the [homepage](/) for an instant preview (no account needed), then sign
up to crawl the site, review the agent's translations, and serve them
with a single script tag. The snippet **fails open**: if anything goes
wrong, visitors see your original language — never a blank page. Start
here: [Quick start — Website](/docs/quickstart-website).

Both modes share the same engine: keys, namespaces, the review
workbench, glossary, translation memory, and immutable releases.

## The safety model

Every translation write — agent or human — passes a mechanical
[placeholder-safety check](/docs/placeholder-safety): a translation
that drops or renames an ICU placeholder is rejected before it enters
the database. Namespaces you mark as **gated** (legal, pricing) never
publish machine output — only reviewer-approved text ships from them.
See the [review workflow](/docs/review-workflow).

## How the docs are organized

- **Getting started** — the [SDK quick start](/docs/quickstart-sdk) and
  the [website quick start](/docs/quickstart-website).
- **Guides** — [concepts](/docs/concepts) (keys, namespaces, releases,
  TM, glossary, pseudo-locale),
  [placeholder safety](/docs/placeholder-safety), and the
  [review workflow](/docs/review-workflow).
- **Reference** — the [Next.js adapter](/docs/nextjs-adapter), the
  [CLI](/docs/cli-reference), and the [REST API](/docs/api-reference).

## The Forjio family

Locavello shares one identity layer (Huudis) and one billing spine
(Plugipay) with the rest of the Forjio family — one account works
everywhere (see the product switcher at the top of these docs). Agent
translation runs on Catentio, the family's agent runtime.

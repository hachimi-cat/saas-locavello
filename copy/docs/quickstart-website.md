---
title: "Quick start — Website"
---

# Quick start — Website mode

Localize a website without touching its code: crawl it, review the
agent's translations, and serve them with one script tag.

## 1. Preview it (no account needed)

Paste your URL into the preview on the [homepage](/) and pick a target
language. Locavello fetches the page, extracts its visible strings, and
agent-translates the first batch — you see original → translated pairs
side by side, usually in under a minute. The preview is capped (40
strings / 500 words per run, plus a shared daily budget) and requires
no signup.

## 2. Create a website project

[Sign up](/signup) and create a project in **Website** mode with your
site's URL. Website projects get everything SDK projects get — the same
workbench, glossary, translation memory, and releases.

## 3. Crawl the site

Start a crawl from the project's pages screen. Each discovered page is
tracked with a per-page status (`discovered` → `crawled`, or `error`
with the reason), a key count, and the time it was last crawled. The
extracted strings land in the project's `site` namespace as ordinary
keys — the crawler is just another extractor.

What gets extracted: visible text nodes plus user-facing attributes
(`placeholder`, `title`, `alt`, `aria-label`). Scripts, styles, code
blocks, URLs, and non-text content are skipped.

## 4. Translate and review

Add your target locales, queue the agent first pass, and review in the
workbench — exactly as in SDK mode. Every write passes the
[placeholder-safety gate](/docs/placeholder-safety), and namespaces
marked **gated** only ever publish reviewer-approved text.

## 5. Publish a release

Publish a release per locale. Releases are immutable and
content-hashed — the snippet serves **only released** translations,
never drafts, so nothing reaches visitors until you say so.

## 6. Add the script tag

```html
<script
  src="https://locavello.forjio.com/js/locavello.js"
  data-project="prj_01jxxxxxxxxxxxxxxxxxxxxxxx"
  defer
></script>
```

That's the whole integration. The snippet:

- translates the page's visible text and user-facing attributes from
  the latest published release for the visitor's locale
- adds a small locale switcher (bottom-right) listing your enabled
  locales, and sets `document.documentElement.lang`
- remembers the visitor's choice in `localStorage`; a `?lv_locale=id`
  query parameter overrides it (useful for sharing links)
- re-applies translations when the DOM changes, so dynamically
  inserted content gets a pass too
- skips anything inside an element marked `data-locavello-skip`

## Fails open, by design

If the catalog can't be fetched — network error, no release yet, bad
response — the snippet does **nothing**: your page renders exactly as
your server sent it, in its source language. Never a blank page, never
a spinner. The catalog endpoint itself is public, CORS-open, and
cacheable (see
[API reference → Public endpoints](/docs/api-reference#public-endpoints-no-auth)).

---
title: "Concepts"
---

# Concepts

The engine in one page: what keys, namespaces, releases, translation
memory, the glossary, the pseudo-locale, and the check gate actually
are.

## Keys and namespaces

A **key** is one translatable string in one project. It carries the
source text, an optional description and screenshot URL for reviewer
context, an optional `maxLength` budget, usage locations (recorded by
extract), and the ICU placeholders derived from its source text.

Keys live in **namespaces**. Every project starts with a `default`
namespace; more are created explicitly or auto-created when extract
discovers them. Two rules keep this predictable:

- A namespace comes **only** from an explicit colon form:
  `t('marketing:hero.title')`. Dots never split —
  `t('marketing.hero.title')` is a single key in `default`.
- In catalog files, `default` keys stay bare and namespaced keys are
  dotted: `marketing.hero.title`.

**Source-text-as-key** is the zero-maintenance mode: `t('Create link')`
makes the English copy itself the key, so your source catalog needs no
separate copywriting step.

Keys are **counted once per project** — adding locales never multiplies
your key count. Removed keys are archived (by `extract --push --prune`),
not deleted.

### Review policy

Each namespace has a review policy:

- `standard` — publishing ships the best available translation:
  approved if there is one, otherwise the latest machine or
  needs-review value.
- `gated` — publishing ships **approved translations only**, and an
  agent write can never land as terminal machine output (it is
  downgraded to needs-review). Use it for legal, pricing — anywhere raw
  machine output must never reach users.

## Translation statuses

Each (key, locale) pair has at most one translation, in one of four
states:

| Status | Meaning |
|---|---|
| `machine` | Agent first pass, untouched by a human |
| `needs_review` | A human edit awaiting review, or agent output in a gated namespace |
| `approved` | Reviewer-approved; feeds the translation memory |
| `rejected` | Rejected with a reason; excluded from publishing and re-queued for the next agent pass |

See the [review workflow](/docs/review-workflow) for how strings move
between states.

## Locales and fallback chains

Target locales are BCP-47 tags (`id`, `pt-BR`). Each can declare a
`fallback` locale, forming a chain that resolution walks:
`pt-BR → pt → source`. The chain applies identically in the SDK
(client-side resolution), in the serving endpoint (pre-flattened
catalog), and in `pull`. Locales can be disabled without deleting their
data, and can be flagged `rtl`.

## Releases

Publishing a locale freezes its publishable catalog into a **release**:
immutable, content-hashed, permanent. Serving and `pull` read releases
only — drafts never reach users. Publishing identical content is a
no-op (you get the existing release back), and any two releases can be
diffed key-by-key: added, removed, changed.

## Translation memory

Every approved translation is stored in an account-wide TM keyed by a
hash of the source text. When the same string shows up again — in this
project or any other you own — the workbench suggests the exact match
first, then fuzzy candidates. Approved entries always beat machine
ones. This is the compounding asset: your second product localizes
cheaper than your first.

## Glossary

Two kinds of term, scoped account-wide or per project:

- **Do-not-translate** — brand names, product names. The check gate
  warns when a DNT term present in the source disappears from a
  translation.
- **Forced translation** — a term must translate to a specific value in
  a specific locale.

Glossary terms are passed to the agent with every translation run and
surfaced in the workbench while editing.

## Pseudo-locale (en-XA)

A synthetic locale generated from your source text: accented, ~30%
padded, and bracketed — `"Save changes"` becomes
`"[Ŝàṽé çĥàñĝéŝ~~~~]"` — with ICU placeholders left intact so messages
still format. Hardcoded strings stay unaccented; tight layouts overflow
visibly. Generate it offline with `locavello pseudo` or fetch it with
`locavello pull --pseudo`. It is synthesized on the fly and never costs
agent words.

## The check gate

`locavello check` (or `GET /projects/:id/check`) runs the mechanical
release-readiness report: missing keys and placeholder mismatches are
errors; length overflows, glossary violations, and unreviewed strings
are warnings. Wire it into CI so a build cannot ship with a missing or
placeholder-broken translation. Details:
[CLI reference](/docs/cli-reference#locavello-check).

## Agent words

Agent translation is metered in **source words**: whitespace-delimited
tokens of the source text with ICU syntax stripped. When you queue a
job the estimate is computed up front, so you see the cost before the
run — and it is checked against your plan's word budget before
anything is queued (a run that would exceed it is rejected with
`UPGRADE_REQUIRED`). Translation-memory hits, human edits, reviews,
and the pseudo-locale never consume agent words.

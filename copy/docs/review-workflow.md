---
title: "Review workflow"
---

# Review workflow

Locavello's quality model: the agent does the volume, mechanical gates
catch what machines can catch, and human reviewers — free seats, on
every tier — decide what actually ships where it matters.

## The lifecycle

```text
             agent first pass
                   │
                   ▼
               machine ──────────────┐
                   │                 │  (gated namespace:
     human edit    ▼                 │   agent output lands
        ┌──── needs_review ◄─────────┘   here instead)
        │          │
        │   reviewer decides
        │      ┌───┴────┐
        ▼      ▼        ▼
    approved        rejected (with a reason)
        │                │
   feeds the TM     excluded from publishing,
                    re-queued for the next agent pass
```

- **`machine`** — the agent's first pass, untouched. In a `gated`
  namespace, agent output is downgraded to `needs_review` on write —
  machine output is never a terminal state there.
- **`needs_review`** — the default for human edits, and agent output in
  gated namespaces.
- **`approved`** — a reviewer signed off (or an editor saved with
  approve-in-one-step). The reviewer is recorded, and the value is
  upserted into the account-wide translation memory.
- **`rejected`** — rejected with a required, stored reason. Rejected
  values never publish, count as *missing* in the check gate, and the
  key is picked up again by the next agent pass for that locale.

Every one of these writes — agent or human — passes the
[placeholder-safety gate](/docs/placeholder-safety) first.

## The review queue

The queue collects everything with status `machine` or `needs_review`,
**oldest first**, optionally filtered by locale. Each entry carries the
context a reviewer needs to decide without leaving the queue: source
text, key description, screenshot URL if set, placeholders, length
budget, usage context, and the namespace's review policy.

## The workbench

For deeper work than the queue, the workbench is a three-pane editor:

- **Left** — the key list, with filters: namespace, locale, status
  (including *missing*), and full-text search over names and source
  text.
- **Center** — the editor for the active locale, with the source's
  placeholder chips and live validation.
- **Right** — context: description, length budget, usage sites,
  **translation-memory suggestions** (exact match first, then fuzzy —
  one click inserts), and **glossary hits** for terms present in the
  source.

## What publishing ships

Publishing a release evaluates each key against its namespace policy:

| | `standard` namespace | `gated` namespace |
|---|---|---|
| `approved` | ships | ships |
| `machine` / `needs_review` | ships (best available) | **held back** |
| `rejected` / no translation | held back | held back |

Standard namespaces optimize for coverage — a reviewed-later machine
translation is usually better than an untranslated string. Gated
namespaces (mark `legal`, `pricing`, anything liability-shaped)
optimize for control: nothing unapproved ever reaches users from them.

Held-back keys simply fall back at runtime — to the locale's fallback
chain, then the source language. Never a blank.

## Reviewers are free

There is no per-seat charge for translators or reviewers on any tier —
inviting a native speaker to review never costs money. Plans are
priced on projects, keys, and agent words instead. See
[pricing](/pricing).

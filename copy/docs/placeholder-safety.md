---
title: "Placeholder safety"
---

# Placeholder safety

The number-one cause of runtime crashes in localized apps is a
translation that drops or renames an ICU placeholder — `Hello {name}`
translated as `Halo semua`, and the app formats against an argument
that no longer exists. Catching this requires **no human judgement**,
so Locavello enforces it mechanically, everywhere, on every write.

## The rule

A translation must reference **exactly** the source message's
placeholder names. No drops, no renames, no inventions.

```text
source:       You have {count, plural, one {# item} other {# items}}
✅ accepted:  Kamu punya {count, plural, other {# barang}}
❌ rejected:  Kamu punya beberapa barang          → missing: [count]
❌ rejected:  Kamu punya {jumlah} barang          → missing: [count], extra: [jumlah]
```

The scanner understands ICU structure: nested arguments
(`{count, plural, one {…} other {…}}`), typed arguments
(`{n, number, integer}`), `select` / `selectordinal`, and ICU
apostrophe escaping (`''` is a literal `'`; quoted text like
`'{'` is literal and not a placeholder).

## Where it runs

The same pure check runs at four layers, so the answer never varies:

1. **On every write** — `PUT /keys/:keyId/translations/:locale`
   rejects a mismatched value with `422 PLACEHOLDER_MISMATCH`,
   listing which names are missing and which are extra. A broken
   translation never enters the database. This applies to agent output
   and human edits equally — the agent gets no exemption.
2. **In the workbench** — the editor shows the source's placeholders as
   chips and validates as you type.
3. **In CI** — `locavello check` reports any `placeholder_mismatch` as
   an error, which exits non-zero and fails the build.
4. **In the source of truth** — a key's declared placeholders are
   derived server-side from its source text at push time, so the gate
   can never disagree with what extract sent.

## What the agent sees

Translation runs receive each key's placeholder list alongside the
source text and glossary. But the safety property does not depend on
the agent behaving: whatever comes back still goes through the same
mechanical gate before it can be stored. Agents are drafted; gates are
trusted.

## Length budgets

A related mechanical check: give a key a `maxLength` and Locavello
estimates the **display length** of each translation — placeholder
bodies collapse to a nominal width so `{count, plural, …}` doesn't
count its ICU syntax against your UI slot. Overflows come back as a
`lengthWarning` on write and as `length_overflow` warnings in
`locavello check` (errors under `--strict`).

## What this doesn't do

Placeholder safety is deliberately narrow: it guarantees a translation
can *format*, not that it reads well. Tone, register, and correctness
are what the [review workflow](/docs/review-workflow) — and your free
reviewer seats — are for.

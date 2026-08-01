import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Code2,
  FileCode2,
  Globe,
  Layers,
  ShieldCheck,
  Sparkles,
  TestTube2,
} from 'lucide-react';

/*
 * Locavello feature detail page — everything listed here runs in
 * production today. Structure (centered hero → 2-col grid → CTA) is
 * the family standard.
 */

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Agent translation with a placeholder-safety gate, a three-pane review workbench, immutable releases, glossary + translation memory, a CI gate, and two ways to ship: SDK or script tag.',
};

const features = [
  {
    Icon: Sparkles,
    title: 'Agent translation with a safety gate',
    body: 'An agent produces the first pass for every locale, and a mechanical check runs on every write — human or machine.',
    details: [
      'A translation that drops or renames an ICU placeholder is rejected before it reaches the database',
      'Word cost is estimated up front when you queue a job',
      'Glossary terms are passed to the agent with every run',
      'Rejected translations are automatically re-queued on the next pass',
    ],
  },
  {
    Icon: Layers,
    title: 'A workbench built for review',
    body: 'Three panes: your keys, the editor, and the context a reviewer actually needs.',
    details: [
      'Placeholder chips show exactly which ICU arguments the translation must keep',
      'Translation-memory suggestions insert with one click',
      'Glossary hits flag do-not-translate and forced terms inline',
      'Filter by namespace, locale, status, or full-text search',
    ],
  },
  {
    Icon: ShieldCheck,
    title: 'Review queue + gated namespaces',
    body: 'Everything the agent produced lands in a queue, oldest first, with approve and reject-with-reason.',
    details: [
      'Mark namespaces like legal or pricing as gated',
      'Gated namespaces publish reviewer-approved translations only — machine output never auto-ships',
      'Approvals feed the translation memory automatically',
      'Statuses: machine → needs review → approved (or rejected, with a reason)',
    ],
  },
  {
    Icon: FileCode2,
    title: 'Immutable, diffable releases',
    body: 'Publishing freezes a content-hashed catalog per locale. What shipped is never a mystery.',
    details: [
      'Publishing identical content is a no-op — no duplicate releases',
      'Key-level diff between any two releases: added, removed, changed',
      'Serving and pull always read from releases, never drafts',
      'Fallback chains are resolved per locale (pt-BR → pt → source)',
    ],
  },
  {
    Icon: Boxes,
    title: 'Glossary + cross-project translation memory',
    body: 'Consistency machinery that compounds: every approval makes the next project cheaper.',
    details: [
      'Do-not-translate terms (brand names) and forced translations per locale',
      'Glossary scopes: account-wide or per project',
      'TM matches suggest exact hits first, then fuzzy candidates',
      'TM is shared across all your projects — approved beats machine',
    ],
  },
  {
    Icon: TestTube2,
    title: 'Pseudo-locale + CI gate',
    body: 'Catch i18n bugs before you pay for a single translation, and block regressions in CI.',
    details: [
      'en-XA pseudo-locale: accented, padded, bracketed — ICU placeholders intact',
      'locavello pseudo runs locally, offline, for free',
      'locavello check fails CI on missing keys and placeholder mismatches',
      'Warnings for length overflows, glossary violations, and unreviewed strings — strict mode fails on those too',
    ],
  },
  {
    Icon: Code2,
    title: 'SDK mode: zero runtime dependency',
    body: 'Catalogs are committed to your repo. Your app never calls Locavello in production.',
    details: [
      'locavello extract scans your source for t() calls and pushes keys',
      'locavello pull writes catalogs + a generated locavello.d.ts — typed, autocompleted keys',
      '@forjio/locavello-next: useT(), getT(), Provider — ICU MessageFormat with fallback chains',
      't() never throws and never renders blank — worst case is your source language',
    ],
  },
  {
    Icon: Globe,
    title: 'Website mode: one script tag',
    body: 'No code changes. Paste a URL, review the translations, and ship with a single tag.',
    details: [
      'Instant preview from the homepage — no account needed',
      'Crawler extracts visible text per page, with per-page status',
      'The snippet serves published releases and adds a locale switcher',
      'Fails open: if anything breaks, visitors see your original site — never a blank page',
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Localization with the safety rails built in.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
          Extract strings from code or a crawled site, let an agent do the first pass behind
          a mechanical placeholder gate, review what matters, and ship immutable releases —
          via committed catalogs or a single script tag. Every feature below is included on
          every tier, including Free.
        </p>
      </div>

      <div className="mt-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map(({ Icon, title, body, details }) => (
            <article key={title} className="rounded-xl border border-border bg-card p-6 md:p-8">
              <div className="mb-5 flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-6" strokeWidth={1.5} />
              </div>
              <h2 className="text-xl font-semibold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{body}</p>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {details.map((d) => (
                  <li key={d} className="flex items-start gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/60" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>

      <div className="mt-20 text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Start free — no card, and reviewers never cost a seat.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          One project, two locales, 200 keys, and a 1,000-word agent trial. During early
          access, every paid feature is free.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start free <ArrowRight className="size-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
          >
            View pricing
          </Link>
        </div>
      </div>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Minus, Users } from 'lucide-react';

/*
 * Locavello pricing — IDR only for now. The lead is the wedge: the
 * people who make quality (translators + reviewers) are free seats on
 * every tier; you pay for projects, keys, and agent words.
 */

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Locavello pricing. Translators and reviewers are free on every tier — pay for projects, keys, and agent words. Priced in IDR.',
};

const tiers = [
  {
    name: 'Free',
    price: 'Rp 0',
    per: 'forever',
    description: 'Try the whole pipeline on a real project.',
    cta: 'Start Free',
    highlight: false,
  },
  {
    name: 'Starter',
    price: 'Rp 90.000',
    per: '/mo',
    description: 'For a product finding its second market.',
    cta: 'Get Starter',
    highlight: false,
  },
  {
    name: 'Pro',
    price: 'Rp 290.000',
    per: '/mo',
    description: 'For teams shipping in many languages.',
    cta: 'Get Pro',
    highlight: true,
  },
  {
    name: 'Scale',
    price: 'Contact us',
    per: '',
    description: 'For platforms localizing everything.',
    cta: 'Talk to us',
    highlight: false,
  },
];

type CellVal = string | boolean;

const comparisonRows: Array<{
  feature: string;
  free: CellVal;
  starter: CellVal;
  pro: CellVal;
  scale: CellVal;
}> = [
  { feature: 'Translator + reviewer seats', free: 'Free, unlimited', starter: 'Free, unlimited', pro: 'Free, unlimited', scale: 'Free, unlimited' },
  { feature: 'Projects', free: '1', starter: '3', pro: '10', scale: 'Unlimited' },
  { feature: 'Locales per project', free: '2', starter: '5', pro: 'Unlimited', scale: 'Unlimited' },
  { feature: 'Keys per project', free: '200', starter: '2,000', pro: '20,000', scale: 'Unlimited' },
  { feature: 'Agent translation words', free: '1,000 one-off trial', starter: '50,000 / mo', pro: '250,000 / mo', scale: 'Negotiated' },
  { feature: 'CLI + Next.js SDK', free: true, starter: true, pro: true, scale: true },
  { feature: 'Pseudo-locale (en-XA)', free: true, starter: true, pro: true, scale: true },
  { feature: 'CI check gate', free: true, starter: true, pro: true, scale: true },
  { feature: 'Website mode (crawl + script tag)', free: true, starter: true, pro: true, scale: true },
  { feature: 'Review workbench + review queue', free: true, starter: true, pro: true, scale: true },
  { feature: 'Glossary + translation memory', free: true, starter: true, pro: true, scale: true },
  { feature: 'Gated namespaces (approved-only publishing)', free: true, starter: true, pro: true, scale: true },
  { feature: 'Immutable releases + diffs', free: true, starter: true, pro: true, scale: true },
  { feature: 'API keys (lv_live_)', free: true, starter: true, pro: true, scale: true },
];

function CellValue({ value }: { value: CellVal }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-primary" />;
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />;
  return <span className="text-sm">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          The people who make quality are free.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          <span className="font-semibold text-foreground">
            Translators and reviewers are free seats on every tier.
          </span>{' '}
          Per-seat pricing is what makes the incumbents expensive — it taxes you for every
          person who improves your translations. Locavello never charges for people: you pay
          for projects, keys, and agent words.
        </p>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground">
          Priced in IDR. Keys are counted once per project — never per locale copy. Every
          tier includes the CLI, the Next.js SDK, the en-XA pseudo-locale, and the CI check
          gate.
        </p>
        <div className="mx-auto mt-6 max-w-2xl rounded-lg border border-primary/30 bg-primary/5 px-5 py-3.5">
          <p className="text-sm font-medium text-primary">
            Early access — every paid feature is free while we launch; founding customers get
            50% off for 12 months when billing starts.
          </p>
        </div>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`relative rounded-lg border p-8 ${
              tier.highlight ? 'border-primary shadow-lg shadow-primary/10' : 'border-border/50'
            }`}
          >
            {tier.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                Most Popular
              </span>
            )}
            <h2 className="text-xl font-bold">{tier.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{tier.description}</p>
            <p className="mt-6 text-3xl font-bold tabular-nums">
              {tier.price}
              {tier.per && (
                <span className="text-base font-normal text-muted-foreground">{tier.per}</span>
              )}
            </p>
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5 text-primary" />
              Translator + reviewer seats: free
            </p>
            <Link
              href={tier.name === 'Scale' ? '/contact' : '/signup'}
              className={`mt-6 block rounded-md py-2.5 text-center text-sm font-medium ${
                tier.highlight
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'border border-border hover:bg-accent'
              }`}
            >
              {tier.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-20">
        <h2 className="text-center text-2xl font-bold">Tier comparison</h2>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-4 pr-6 text-sm font-medium text-muted-foreground">Feature</th>
                <th className="pb-4 text-center text-sm font-medium">Free</th>
                <th className="pb-4 text-center text-sm font-medium">Starter</th>
                <th className="pb-4 text-center text-sm font-medium text-primary">Pro</th>
                <th className="pb-4 text-center text-sm font-medium">Scale</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.feature} className="border-b border-border/50">
                  <td className="py-4 pr-6 text-sm">{row.feature}</td>
                  <td className="py-4 text-center"><CellValue value={row.free} /></td>
                  <td className="py-4 text-center"><CellValue value={row.starter} /></td>
                  <td className="py-4 text-center"><CellValue value={row.pro} /></td>
                  <td className="py-4 text-center"><CellValue value={row.scale} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-2xl space-y-4 text-center text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">What counts as an agent word?</span>{' '}
          The source-text words the agent translates in a machine first pass — ICU syntax
          stripped, estimated up front when you queue the job so the cost is visible before
          the run. Translation-memory hits, human edits, reviews, and the en-XA
          pseudo-locale never consume agent words. Agent-word quotas apply even during
          early access — each run spends real compute.
        </p>
        <p>
          <span className="font-medium text-foreground">What counts as a key?</span> One
          string in one project. Translating it into 2 or 20 locales doesn&apos;t multiply
          the count.
        </p>
      </div>
    </div>
  );
}

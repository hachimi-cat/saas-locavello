import type { Metadata } from 'next';
import { LocavelloMark } from '@/components/brand/logo';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Why Locavello exists: localization platforms charge per seat and punish teams for involving reviewers. Locavello never charges for people.',
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-20 md:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <LocavelloMark size={32} className="text-primary" />
          <h1 className="text-4xl font-bold tracking-tight">About Locavello</h1>
        </div>

        <div className="mt-10 space-y-6 text-muted-foreground">
          <p className="text-lg">
            Most products stay in one language because localizing them is priced and built
            for enterprises.
          </p>

          <p>
            Locavello is built by Forjio, a small Indonesian team shipping a family of SaaS
            products — every one of which needed localization and none of which could
            justify the incumbents. The platforms that dominate this market charge per seat,
            so the moment you invite the people who actually make translations good — a
            translator, a reviewer, a native-speaker friend — the bill grows. Quality gets
            taxed. Most teams respond by shipping raw machine translation, or by not
            localizing at all.
          </p>

          <p>
            Locavello is a localization engine with the modern pipeline built in: extract
            your strings with a CLI (or crawl your website), let an agent do the first pass,
            review what matters in a purpose-built workbench, and publish immutable releases
            — served from catalogs committed to your repo, or from a single script tag.
          </p>

          <h2 className="pt-4 text-2xl font-bold text-foreground">Our principles</h2>

          <ul className="space-y-4">
            <li>
              <strong className="text-foreground">People are never the meter.</strong>{' '}
              Translators and reviewers are free seats on every tier. You pay for projects,
              keys, and agent words — never for the humans who improve quality.
            </li>
            <li>
              <strong className="text-foreground">Safety should be mechanical.</strong>{' '}
              The most common i18n crash is a translation that drops a placeholder. Catching
              that requires no judgement, so Locavello enforces it on every single write —
              agent or human — instead of hoping a reviewer notices.
            </li>
            <li>
              <strong className="text-foreground">Never become your dependency.</strong>{' '}
              In SDK mode your catalogs live in your repo and your app never calls Locavello
              at runtime. In website mode the script tag fails open to your original
              language. If Locavello disappears tomorrow, your product keeps working.
            </li>
            <li>
              <strong className="text-foreground">Transparent pricing.</strong>{' '}
              IDR pricing for our market. Keys counted once per project, never per locale
              copy. Monthly billing, no hidden fees, cancel anytime.
            </li>
          </ul>

          <h2 className="pt-4 text-2xl font-bold text-foreground">Built by Forjio</h2>

          <p>
            Locavello is built and maintained by the Forjio team — a family of products
            that share one identity layer (Huudis) and one billing spine (Plugipay). Sign
            up once, work across all of them. Locavello&apos;s agent translation runs on
            Catentio, the family&apos;s agent runtime.
          </p>

          <p>
            Questions? Reach us at{' '}
            <span className="font-mono text-primary">support@forjio.com</span>.
          </p>
        </div>
      </div>
    </div>
  );
}

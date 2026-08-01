import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  Code2,
  FileCode2,
  Layers,
  Megaphone,
  ScanText,
  ShieldCheck,
  Sparkles,
  Terminal,
  X as XIcon,
  Zap,
} from 'lucide-react';
import { HeroBadge, SectionEyebrow } from '@forjio/website-ui';
import { LocavelloMark } from '@/components/brand/logo';
import { HeroInstantPreview } from '@/components/marketing/hero-preview';

/*
 * Locavello marketing home page — the locked Forjio 9-section
 * structure: Hero → How it works → Features → Pricing → Comparison →
 * Developers → Family → FAQ → CTA.
 */

export default function HomePage() {
  return (
    <>
      {/* ============================================================
          HERO — the Mode B instant preview IS the primary CTA.
          ============================================================ */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_20%,hsl(var(--primary)/0.18)_0%,transparent_50%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(circle,hsl(var(--border))_1px,transparent_1.5px)] [background-size:24px_24px] opacity-50 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
        />
        <div className="max-w-6xl mx-auto px-4 md:px-6 pt-14 md:pt-20 pb-12 md:pb-16">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
            <HeroBadge
              brandIcon={<LocavelloMark size={12} className="text-primary" />}
              primary="Forjio family"
              secondary="One account across every product"
            />

            <h1 className="mt-5 text-[36px] leading-[1.05] md:text-[56px] md:leading-[1.02] font-semibold tracking-[-0.025em]">
              Ship your product in{' '}
              <span className="relative whitespace-nowrap">
                <span className="relative z-10">every language</span>
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-1 h-3 md:h-4 bg-primary/60 dark:bg-primary/30 -z-0 rounded-sm"
                />
              </span>
              .
            </h1>

            <p className="mt-5 text-[15px] md:text-base leading-relaxed text-muted-foreground max-w-[62ch] mx-auto">
              Extract your strings, let an agent do the first pass, review what matters, and
              release — with a CLI + SDK for your codebase, or a single script tag for your
              website. Translators and reviewers are free on every plan.
            </p>

            <p className="mt-7 text-sm font-medium text-foreground">
              See your own site translated — right now, no account:
            </p>
            <div className="mt-3 w-full">
              <HeroInstantPreview />
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Get started free
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
              <Link
                href="/docs"
                className="inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-card/80 transition-colors backdrop-blur-sm"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          HOW IT WORKS
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Extract. Translate. Ship.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
              One pipeline whether your strings come from source code or a crawled website.
              The free tier needs no card.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              {
                num: '01',
                Icon: ScanText,
                title: 'Extract your strings',
                body: 'Run `locavello extract` to scan your code for t() calls and push every key — or paste your site URL and let the crawler pull the visible text from each page.',
              },
              {
                num: '02',
                Icon: Sparkles,
                title: 'Agent first pass, human review',
                body: 'An agent translates everything, and a mechanical gate rejects any output that drops an ICU placeholder. Your reviewers approve, edit, or reject in the workbench — their seats are free.',
              },
              {
                num: '03',
                Icon: Zap,
                title: 'Release it',
                body: 'Publish an immutable, content-hashed release per locale. `locavello pull` commits the catalogs into your repo, or the script tag serves the release on your site — failing open to your original language.',
              },
            ].map(({ num, Icon, title, body }) => (
              <div key={num} className="rounded-lg border border-border bg-card p-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="inline-flex items-center justify-center size-8 rounded-md bg-primary/10 text-primary text-[12px] font-mono font-semibold">
                    {num}
                  </span>
                  <Icon className="size-4 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-2">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          FEATURES
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <SectionEyebrow>Features</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Everything Locavello ships.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
              Everything below runs in production today.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                Icon: Sparkles,
                title: 'Agent translation, gated',
                body: 'An agent produces the first pass for every locale. A mechanical placeholder-safety check runs on every single write — a translation that drops or renames an ICU placeholder never enters the database.',
              },
              {
                Icon: Layers,
                title: 'Review workbench',
                body: 'Three panes: your keys, the editor, and context — source text, placeholder chips, translation-memory suggestions, and glossary hits. A review queue surfaces everything the agent produced, oldest first.',
              },
              {
                Icon: ShieldCheck,
                title: 'Gated namespaces',
                body: 'Mark namespaces like legal or pricing as gated: machine output never auto-publishes from them. Only reviewer-approved translations ship — always.',
              },
              {
                Icon: Boxes,
                title: 'Glossary + translation memory',
                body: 'Do-not-translate terms and forced translations, account-wide or per project. Every approval feeds a cross-project translation memory that suggests matches on the next string.',
              },
              {
                Icon: FileCode2,
                title: 'Releases you can diff',
                body: 'Publishing creates an immutable, content-hashed release per locale. Publishing the same content twice is a no-op, and any two releases diff key-by-key.',
              },
              {
                Icon: Code2,
                title: 'CI gate + pseudo-locale',
                body: '`locavello check` fails your build on missing keys and placeholder mismatches, and warns on length overflows. The en-XA pseudo-locale catches hardcoded strings and tight layouts before you pay for a single translation.',
              },
            ].map(({ Icon, title, body }) => (
              <div key={title} className="rounded-lg border border-border bg-card p-6">
                <div className="size-10 rounded-md flex items-center justify-center bg-primary/10 text-primary mb-4">
                  <Icon className="size-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] mb-2">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          PRICING
          ============================================================ */}
      <section id="pricing" className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-16 md:pt-24">
          <div className="text-center max-w-3xl mx-auto">
            <SectionEyebrow>Pricing</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Translators and reviewers are free. On every tier.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[62ch] mx-auto">
              Per-seat pricing is what makes the incumbents expensive. We never charge for
              the people who make quality — you pay for projects, keys, and agent words.
              Priced in IDR.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-1.5 text-[12.5px] font-medium text-primary">
              Early access — every paid feature is free while we launch; founding customers
              get 50% off for 12 months when billing starts.
            </p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 md:px-6 pt-12 pb-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                name: 'Free',
                price: 'Rp 0',
                priceUnit: 'forever',
                who: 'Try the whole pipeline on a real project.',
                features: [
                  '1 project · 2 locales',
                  '200 keys per project',
                  '1,000 agent words (one-off trial)',
                  'CLI + SDK + pseudo-locale + CI gate',
                ],
                cta: { label: 'Start free', href: '/signup' },
              },
              {
                name: 'Starter',
                price: 'Rp 90.000',
                priceUnit: '/ month',
                who: 'For a product finding its second market.',
                features: [
                  '3 projects · 5 locales',
                  '2,000 keys per project',
                  '50,000 agent words / month',
                  'Unlimited free translator + reviewer seats',
                ],
                cta: { label: 'Start Starter', href: '/signup' },
              },
              {
                name: 'Pro',
                price: 'Rp 290.000',
                priceUnit: '/ month',
                who: 'For teams shipping in many languages.',
                featured: true,
                features: [
                  '10 projects · unlimited locales',
                  '20,000 keys per project',
                  '250,000 agent words / month',
                  'Unlimited free translator + reviewer seats',
                ],
                cta: { label: 'Start Pro', href: '/signup' },
              },
              {
                name: 'Scale',
                price: 'Contact us',
                priceUnit: '',
                who: 'For platforms localizing everything.',
                features: [
                  'Unlimited projects, locales, and keys',
                  'Negotiated agent words',
                  'Unlimited free translator + reviewer seats',
                  'Everything in Pro',
                ],
                cta: { label: 'Talk to us', href: '/contact' },
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl border p-5 flex flex-col ${
                  tier.featured ? 'border-primary bg-card shadow-lg shadow-primary/5' : 'border-border bg-card'
                }`}
              >
                {tier.featured && (
                  <span className="absolute -top-2.5 left-5 inline-flex items-center rounded-full bg-primary text-primary-foreground px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    Most popular
                  </span>
                )}
                <h3 className="text-[18px] font-semibold tracking-tight">{tier.name}</h3>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground leading-snug min-h-[40px]">
                  {tier.who}
                </p>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-[24px] font-bold tabular-nums tracking-tight">
                    {tier.price}
                  </span>
                  {tier.priceUnit && (
                    <span className="text-xs text-muted-foreground">{tier.priceUnit}</span>
                  )}
                </div>
                <ul className="mt-5 space-y-2 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[12.5px] text-foreground/90 leading-[1.4]">
                      <Check className="size-3.5 mt-0.5 shrink-0 text-primary" strokeWidth={2.25} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={tier.cta.href}
                  className={`mt-6 inline-flex items-center justify-center w-full h-9 px-4 rounded-md text-sm font-medium transition-colors ${
                    tier.featured
                      ? 'bg-primary text-primary-foreground hover:opacity-90'
                      : 'bg-card border border-border hover:bg-muted'
                  }`}
                >
                  {tier.cta.label}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground max-w-[70ch] mx-auto">
            Keys are counted once per project — never multiplied by locale. Every tier
            includes the CLI, the Next.js SDK, the en-XA pseudo-locale, and the CI check
            gate.{' '}
            <Link href="/pricing" className="text-primary hover:underline">
              Full comparison →
            </Link>
          </p>
        </div>
      </section>

      {/* ============================================================
          COMPARISON
          ============================================================ */}
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="text-center max-w-2xl mx-auto">
            <SectionEyebrow>Compare</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              How Locavello stacks up.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[60ch] mx-auto">
              Against the platforms teams actually evaluate. Where their models differ from
              ours, we describe the model rather than invent numbers.
            </p>
          </div>

          <div className="mt-10 overflow-x-auto overflow-y-hidden -mx-4 md:mx-0 rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full text-sm min-w-[840px]">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
                    Capability
                  </th>
                  <th className="px-4 py-3 font-semibold text-primary">Locavello</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Crowdin</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Lokalise</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Phrase</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Weglot</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    cap: 'Translator + reviewer seats',
                    s: 'Free, every tier',
                    a: 'Per-seat plans',
                    b: 'Per-seat plans',
                    c: 'Per-seat plans',
                    d: 'Quota-based plans',
                  },
                  {
                    cap: 'Keys counted per project, not per locale',
                    s: true,
                    a: 'Plan-dependent',
                    b: 'Plan-dependent',
                    c: 'Plan-dependent',
                    d: 'Word quotas',
                  },
                  {
                    cap: 'Zero runtime dependency (committed catalogs)',
                    s: true,
                    a: 'Via file exports',
                    b: 'Via file exports',
                    c: 'Via file exports',
                    d: 'Proxy / JS-served',
                  },
                  {
                    cap: 'Agent first pass with a mechanical placeholder gate',
                    s: true,
                    a: 'MT add-ons',
                    b: 'MT add-ons',
                    c: 'MT add-ons',
                    d: 'MT built-in',
                  },
                  {
                    cap: 'Instant website preview without an account',
                    s: true,
                    a: 'Account required',
                    b: 'Account required',
                    c: 'Account required',
                    d: 'Account required',
                  },
                  {
                    cap: 'Pricing',
                    s: 'From Rp 90k/mo · IDR',
                    a: 'Per-seat, USD',
                    b: 'Per-seat, USD',
                    c: 'Per-seat, USD/EUR',
                    d: 'Usage quotas, EUR',
                  },
                ].map((row) => (
                  <tr key={row.cap} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 text-foreground/90">{row.cap}</td>
                    <Cell value={row.s} highlight />
                    <Cell value={row.a} />
                    <Cell value={row.b} />
                    <Cell value={row.c} />
                    <Cell value={row.d} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            Competitor descriptions reflect their publicly documented pricing models, not
            measured comparisons.
          </p>
        </div>
      </section>

      {/* ============================================================
          FOR DEVELOPERS
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-start">
            <div>
              <SectionEyebrow>For developers</SectionEyebrow>
              <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
                Catalogs in your repo. Typed keys. A CI gate.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
                Mode A is built the way you wish i18n worked: `extract` finds your t()
                calls, `pull` commits the released catalogs plus a generated
                `locavello.d.ts` — so keys autocomplete and typos fail type-check. At
                runtime your app never calls Locavello at all.
              </p>
              <ul className="mt-6 space-y-3">
                {[
                  'ICU MessageFormat with per-locale fallback chains — t() never throws and never renders blank',
                  'locavello check fails CI on missing keys and placeholder mismatches',
                  'locavello pseudo generates en-XA offline to catch hardcoded strings early',
                  'REST API with lv_live_ keys and a consistent response envelope',
                ].map((b) => (
                  <li key={b} className="flex items-start gap-2 text-sm text-foreground/90 leading-relaxed">
                    <Check className="size-4 mt-0.5 shrink-0 text-primary" strokeWidth={2.25} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/docs"
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Read the docs
                  <ArrowRight className="size-4" strokeWidth={1.5} />
                </Link>
                <Link
                  href="/docs/cli-reference"
                  className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted transition-colors"
                >
                  <Code2 className="size-4" strokeWidth={1.5} />
                  CLI reference
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <TerminalCard label="locavello">
                <span className="text-white/40"># Install once</span>
                {'\n'}
                <span className="text-white/90">$ npm i -g @forjio/locavello-cli</span>
                {'\n\n'}
                <span className="text-white/40"># Scan for t() calls and push the keys</span>
                {'\n'}
                <span className="text-white/90">$ locavello extract --push</span>
                {'\n'}
                <span className="text-green-300">
                  Extracted 214 key(s) from 87 file(s) — 12 new, 0 warning(s).
                </span>
                {'\n\n'}
                <span className="text-white/40"># Commit released catalogs + typed keys</span>
                {'\n'}
                <span className="text-white/90">$ locavello pull</span>
                {'\n'}
                <span className="text-green-300">id: 214 key(s) (release rel_01JXW…)</span>
                {'\n'}
                <span className="text-green-300">Wrote locavello.d.ts</span>
              </TerminalCard>

              <TerminalCard label="cart.tsx">
                <span className="text-purple-300">import</span>
                <span className="text-white/90">{' { useT } '}</span>
                <span className="text-purple-300">from</span>
                <span className="text-green-300">{" '@forjio/locavello-next'"}</span>
                <span className="text-white/90">;</span>
                {'\n\n'}
                <span className="text-purple-300">function</span>
                <span className="text-white/90">{' Cart({ count }: { count: number }) {'}</span>
                {'\n'}
                <span className="text-white/90">{'  const t = useT();'}</span>
                {'\n'}
                <span className="text-white/90">{'  return <p>{t('}</span>
                <span className="text-green-300">{"'cart.items'"}</span>
                <span className="text-white/90">{', { count })}</p>;'}</span>
                {'\n'}
                <span className="text-white/90">{'}'}</span>
                {'\n\n'}
                <span className="text-white/40">
                  {"// en: '{count, plural, one {# item} other {# items}}'"}
                </span>
              </TerminalCard>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          FORJIO FAMILY
          ============================================================ */}
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-12 md:py-16">
          <div className="text-center max-w-3xl mx-auto">
            <SectionEyebrow>One login</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Sign in once. Use every Forjio product.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[60ch] mx-auto">
              Locavello shares its account system with the rest of the Forjio family through
              Huudis SSO. Add a teammate here and they&apos;re already part of your other
              Forjio workspaces.
            </p>
          </div>

          <div className="mt-12 max-w-2xl mx-auto">
            <div className="rounded-xl border border-border bg-card shadow-sm p-8">
              <div className="flex flex-col items-center">
                <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary border border-primary/20 mb-2">
                  <ShieldCheck className="size-7" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-foreground">Huudis</p>
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">identity</p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-3">
                {[
                  { name: 'Locavello', icon: LocavelloMark, current: true, label: 'this product' },
                  { name: 'Storlaunch', icon: Zap, label: 'storefront' },
                  { name: 'Plugipay', icon: CircleDollarSign, label: 'payments' },
                  { name: 'Fulkruma', icon: Boxes, label: 'fulfillment' },
                  { name: 'Ripllo', icon: Megaphone, label: 'marketing' },
                  { name: 'Catentio', icon: Sparkles, label: 'agents' },
                ].map((p) => (
                  <div
                    key={p.name}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-3 ${
                      p.current
                        ? 'border-primary/40 bg-primary/5 ring-1 ring-primary/20'
                        : 'border-border bg-card/40'
                    }`}
                  >
                    <p.icon
                      className={`size-5 ${p.current ? 'text-primary' : 'text-muted-foreground'}`}
                      strokeWidth={1.5}
                    />
                    <span className="text-[10.5px] font-medium leading-tight text-center">{p.name}</span>
                    <span className="text-[9px] text-muted-foreground leading-tight text-center">
                      {p.label}
                    </span>
                    {p.current && (
                      <span className="text-[9px] font-mono text-primary">you are here</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-6 text-sm text-muted-foreground text-center">
              Powered by{' '}
              <a href="https://huudis.com" className="text-primary hover:underline font-medium">
                Huudis
              </a>{' '}
              — the identity provider for the Forjio family. Locavello&apos;s own agent
              translation runs on{' '}
              <a href="https://catent.io" className="text-primary hover:underline font-medium">
                Catentio
              </a>
              , the family&apos;s agent runtime.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          FAQ
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-16 md:py-24">
          <div className="max-w-2xl">
            <SectionEyebrow>FAQ</SectionEyebrow>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em]">
              Common questions.
            </h2>
          </div>

          <ul className="mt-10 divide-y divide-border rounded-lg border border-border bg-card overflow-hidden">
            {[
              {
                q: 'Is the free tier really free?',
                a: 'Yes — a tier, not a trial. One project, two locales, 200 keys, and a one-off 1,000-word agent translation trial. And during early access, every paid feature is free for everyone while we launch.',
              },
              {
                q: 'Do I pay for translator or reviewer seats?',
                a: 'Never, on any tier. Per-seat pricing is what makes traditional localization platforms expensive — it punishes you for involving the people who make translations good. You pay for projects, keys, and agent words. People are free.',
              },
              {
                q: 'Can the agent break my app with a bad translation?',
                a: 'Not through a dropped placeholder — the most common i18n crash. Every write, agent or human, passes a mechanical check that the translation uses exactly the source string’s ICU placeholders; mismatches are rejected before they reach the database. Namespaces you mark as gated (legal, pricing) additionally never publish machine output — only reviewer-approved text ships from them.',
              },
              {
                q: 'What happens if Locavello goes down?',
                a: 'In SDK mode: nothing. Your catalogs are committed to your repo and your app never calls Locavello at runtime. In website mode, the script tag fails open — visitors see your original language, never a blank page.',
              },
              {
                q: 'Can I localize my site without touching its code?',
                a: 'Yes. Paste your URL in the preview above, sign up, and Locavello crawls your site, agent-translates the strings, and lets you review them. Publishing puts a single script tag on your site that serves the released translations with a locale switcher.',
              },
              {
                q: 'How does billing work?',
                a: 'Every paid feature is free while we launch, and founding customers get 50% off for 12 months when billing starts. Prices are in IDR, and keys are counted once per project — never per locale copy. One thing is metered from day one: agent-translation words follow the per-tier quotas even during early access, because each run spends real compute.',
              },
            ].map((faq) => (
              <li key={faq.q}>
                <details className="group">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-6 py-5 hover:bg-muted/30 transition-colors [&::-webkit-details-marker]:hidden">
                    <span className="text-[15px] font-medium text-foreground">{faq.q}</span>
                    <ChevronDown
                      className="size-4 text-muted-foreground transition-transform group-open:rotate-180 shrink-0"
                      strokeWidth={1.5}
                    />
                  </summary>
                  <div className="px-6 pb-5 -mt-1 text-sm leading-relaxed text-muted-foreground">
                    {faq.a}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ============================================================
          FOOTER CTA
          ============================================================ */}
      <section className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 md:py-20 text-center">
          <div className="flex flex-col items-center">
            <div className="inline-flex items-center justify-center size-12 rounded-xl bg-primary/10 text-primary mb-6">
              <LocavelloMark size={24} />
            </div>
            <h2 className="text-[28px] md:text-[36px] leading-[1.1] font-semibold tracking-[-0.02em] max-w-[24ch]">
              Your next market speaks another language.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground max-w-[52ch]">
              Start free — no card, reviewers never cost a seat, and everything paid is free
              during early access.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Start free
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 h-10 px-5 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted transition-colors"
              >
                Talk to a human
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function Cell({ value, highlight }: { value: boolean | string; highlight?: boolean }) {
  if (typeof value === 'string') {
    return (
      <td
        className={`px-4 py-3 text-center text-[13px] ${
          highlight ? 'font-semibold text-foreground' : 'text-muted-foreground'
        }`}
      >
        {value}
      </td>
    );
  }
  return (
    <td className="px-4 py-3 text-center">
      {value ? (
        <Check
          className={`size-4 mx-auto ${highlight ? 'text-primary' : 'text-foreground/60'}`}
          strokeWidth={2.25}
        />
      ) : (
        <XIcon className="size-4 mx-auto text-muted-foreground/40" strokeWidth={1.5} />
      )}
    </td>
  );
}

function TerminalCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="absolute -inset-px rounded-xl bg-gradient-to-br from-primary/20 via-transparent to-transparent dark:from-primary/10 blur-sm"
      />
      <div className="relative rounded-xl border border-slate-900/90 bg-[#0B0F1A] shadow-lg overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-500/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-primary/80" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-white/50 font-mono">
            <Terminal className="size-3 text-primary" strokeWidth={1.5} />
            {label}
          </div>
          <span className="text-[11px] text-white/30 font-mono">zsh</span>
        </div>
        <pre className="px-4 py-4 text-[12px] leading-[1.7] font-mono whitespace-pre-wrap break-words">
          {children}
        </pre>
      </div>
    </div>
  );
}

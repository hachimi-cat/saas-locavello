'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Check, CreditCard, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorPanel } from '@/components/ui/error-panel';
import { PageHeader } from '@/components/locavello/page-header';

/*
 * Billing — subscription + the tier table, rendered from the API
 * (lib/billing.ts TIER_DEFS is the single source; this page is never a
 * fourth mirror). Agent-word usage is the one ENFORCED limit — show it
 * as a real meter; the other limits are displayed under the
 * early-access banner.
 */

interface TierDef {
  id: string;
  name: string;
  priceIdr: number;
  blurb: string;
  projectLimit: number;
  localesPerProject: number;
  keysPerProject: number;
  agentWordsPerMonth: number;
  features: string[];
}

interface BillingData {
  subscription: { tier: string; status: string; currentPeriodEnd: string | null };
  earlyAccess: boolean;
  usage: { projects: number; agentWords: { used: number; limit: number } };
  tiers: TierDef[];
}

function priceLabel(t: TierDef): string {
  if (t.priceIdr === 0) return 'Rp 0';
  if (t.priceIdr < 0) return 'Contact us';
  return `Rp ${t.priceIdr.toLocaleString('id-ID')}/mo`;
}

export default function BillingPage() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiRequest<BillingData>('/billing')
      .then((r) => setData(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : 'failed to load billing'));
  }, []);
  useEffect(load, [load]);

  const checkout = async (tier: string) => {
    setCheckingOut(tier);
    try {
      const res = await apiRequest<{ hostedUrl: string }>('/billing/checkout', {
        method: 'POST',
        body: { tier },
      });
      window.location.href = res.data.hostedUrl;
    } catch (e) {
      const msg =
        e instanceof ApiRequestError && e.code === 'NOT_CONFIGURED'
          ? 'Billing is not configured on this deployment yet.'
          : e instanceof Error
            ? e.message
            : 'checkout failed';
      toast.error(msg);
      setCheckingOut(null);
    }
  };

  if (error) return <ErrorPanel title="Billing unavailable" message={error} onRetry={load} />;
  if (!data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const current = data.subscription.tier;
  const words = data.usage.agentWords;
  const wordPct =
    words.limit > 0 ? Math.min(100, Math.round((words.used / words.limit) * 100)) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Billing"
        description="Your plan, live usage, and the tier table. Translators and reviewers are free seats on every tier."
      />

      {data.earlyAccess && (
        <div className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-foreground">
          Early access — every paid feature is free while we launch; founding customers get 50%
          off for 12 months when billing starts. Agent-word budgets are live already.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 text-primary" /> Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{data.usage.projects}</div>
            <p className="text-sm text-muted-foreground">across this workspace</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-primary" /> Agent words
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {words.used.toLocaleString()}
              <span className="text-base font-normal text-muted-foreground">
                {' '}
                of {words.limit < 0 ? 'unlimited' : words.limit.toLocaleString()}
                {current === 'free' ? ' (one-off trial)' : ' this month'}
              </span>
            </div>
            {words.limit > 0 && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className={wordPct >= 90 ? 'h-full bg-destructive' : 'h-full bg-primary'}
                  style={{ width: `${wordPct}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
        {data.tiers.map((t) => {
          const isCurrent = t.id === current;
          const paid = t.priceIdr > 0;
          return (
            <Card key={t.id} className={isCurrent ? 'border-primary' : undefined}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  {t.name}
                  {isCurrent && <Badge>Current</Badge>}
                </CardTitle>
                <div className="text-xl font-semibold">{priceLabel(t)}</div>
                <p className="text-xs text-muted-foreground">{t.blurb}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1.5 text-sm">
                  {t.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {paid && !isCurrent && (
                  <Button
                    className="w-full"
                    disabled={checkingOut !== null}
                    onClick={() => checkout(t.id)}
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    {checkingOut === t.id ? 'Redirecting…' : `Upgrade to ${t.name}`}
                  </Button>
                )}
                {t.priceIdr < 0 && (
                  <Button asChild variant="outline" className="w-full">
                    <a href="/contact">Contact us</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

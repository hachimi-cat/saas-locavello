'use client';

/*
 * /dashboard/webhooks — outbound event webhooks (outbox fan-out of the
 * locavello.* events). The signing secret (whsec_…) is shown ONCE at
 * creation; deliveries carry
 * `Locavello-Signature: t=<unix>,v1=<hmac-sha256(secret, t+"."+body)>`,
 * are retried 1 min … 12 h, and each attempt lands in the delivery log
 * (Recent deliveries, below). An endpoint that keeps failing is switched
 * off by Locavello; the reason shows on its row.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Loader2, Plus, RefreshCw, TriangleAlert, Webhook } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ErrorPanel } from '@/components/ui/error-panel';
import { PageHeader } from '@/components/locavello/page-header';
import { errorCode, errorMessage, formatDate } from '@/components/locavello/format';
import type {
  CreatedWebhookSubscription,
  WebhookDeliveryRow,
  WebhookEventType,
  WebhookSubscriptionRow,
} from '@/components/locavello/types';

/** The event types Locavello sends — the backend's catalogue
 *  (GET /webhook-subscriptions/event-types, lib/event-types.ts). */
function useEventCatalog(): WebhookEventType[] | null {
  const [catalog, setCatalog] = useState<WebhookEventType[] | null>(null);
  useEffect(() => {
    apiRequest<{ types: WebhookEventType[] }>('/webhook-subscriptions/event-types')
      .then(({ data }) => setCatalog(data.types ?? []))
      .catch(() => setCatalog([]));
  }, []);
  return catalog;
}

function DeliveryStatus({ status }: { status: WebhookDeliveryRow['status'] }) {
  const cls =
    status === 'succeeded'
      ? 'border-emerald-500/40 text-emerald-400'
      : status === 'failed'
        ? 'border-destructive/50 text-destructive'
        : 'border-amber-500/40 text-amber-400';
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  );
}

async function copyToClipboard(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy — select and copy manually");
  }
}

function AddEndpointDialog({
  catalog,
  onCreated,
}: {
  catalog: WebhookEventType[];
  onCreated: (row: WebhookSubscriptionRow) => void;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [allEvents, setAllEvents] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWebhookSubscription | null>(null);

  function toggle(type: string) {
    setSelected((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]));
  }

  async function submit() {
    if (!allEvents && selected.length === 0) {
      setInlineError('Pick at least one event (or subscribe to all).');
      return;
    }
    setSubmitting(true);
    setInlineError(null);
    try {
      const { data } = await apiRequest<CreatedWebhookSubscription>('/webhook-subscriptions', {
        method: 'POST',
        body: { url: url.trim(), events: allEvents ? ['*'] : selected },
      });
      setCreated(data);
      const { secret: _s, ...row } = data;
      onCreated(row);
    } catch (e) {
      setInlineError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setOpen(false);
    setUrl('');
    setAllEvents(true);
    setSelected([]);
    setCreated(null);
    setInlineError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setOpen(true);
        else if (!submitting) close();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add endpoint
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {created === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Add webhook endpoint</DialogTitle>
              <DialogDescription>
                An HTTPS POST for every matching event. You&apos;ll get the signing secret right
                after — it&apos;s shown only once.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid gap-2">
                <Label htmlFor="wh-url">Endpoint URL</Label>
                <Input
                  id="wh-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/webhooks/locavello"
                />
              </div>
              <div className="space-y-2 rounded-md border border-border p-3">
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={allEvents}
                    onCheckedChange={(v) => setAllEvents(v === true)}
                    className="mt-0.5"
                  />
                  <span>
                    All events <code className="font-mono text-xs text-muted-foreground">(*)</code>
                  </span>
                </label>
                {!allEvents
                  ? catalog.map((ev) => (
                      <label key={ev.type} className="flex items-start gap-2 pl-5 text-sm">
                        <Checkbox
                          checked={selected.includes(ev.type)}
                          onCheckedChange={() => toggle(ev.type)}
                          className="mt-0.5"
                        />
                        <code className="font-mono text-xs">{ev.type}</code>
                      </label>
                    ))
                  : null}
              </div>
              {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting || !url.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add endpoint
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Endpoint added</DialogTitle>
              <DialogDescription>
                Use this signing secret to verify the{' '}
                <code className="font-mono text-xs">Locavello-Signature</code> header on every
                delivery.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">{created.secret}</code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void copyToClipboard(created.secret, 'Signing secret copied')}
                  aria-label="Copy signing secret"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                You won&apos;t see this secret again. If you lose it, remove the endpoint and add
                it again.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function WebhooksPage() {
  const [subs, setSubs] = useState<WebhookSubscriptionRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const catalog = useEventCatalog();

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await apiRequest<{ subscriptions: WebhookSubscriptionRow[] }>(
        '/webhook-subscriptions',
      );
      setSubs(data.subscriptions);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(sub: WebhookSubscriptionRow) {
    setBusyId(sub.id);
    try {
      const { data } = await apiRequest<WebhookSubscriptionRow>(
        `/webhook-subscriptions/${sub.id}`,
        { method: 'PATCH', body: { active: !sub.active } },
      );
      setSubs((prev) => (prev ?? []).map((s) => (s.id === sub.id ? { ...s, ...data } : s)));
      toast.success(data.active ? 'Deliveries resumed' : 'Deliveries paused');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update the endpoint"));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(sub: WebhookSubscriptionRow) {
    setBusyId(sub.id);
    try {
      await apiRequest(`/webhook-subscriptions/${sub.id}`, { method: 'DELETE' });
      setSubs((prev) => (prev ?? []).filter((s) => s.id !== sub.id));
      toast.success('Endpoint removed');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't remove the endpoint"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Webhooks"
        description="Get an HTTPS POST whenever something happens in this workspace — releases, approvals, new projects."
        actions={<AddEndpointDialog catalog={catalog ?? []} onCreated={(row) => setSubs((prev) => [row, ...(prev ?? [])])} />}
      />

      <div className="space-y-6">
        {error ? (
          <ErrorPanel
            title="Couldn't load webhooks"
            message={errorMessage(error)}
            code={errorCode(error)}
            onRetry={() => void load()}
          />
        ) : subs === null ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : subs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Webhook className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">No webhook endpoints yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Add one to receive <code className="font-mono text-xs">locavello.*</code> events
                  — signed, so you can trust every delivery.
                </p>
              </div>
              <AddEndpointDialog catalog={catalog ?? []} onCreated={(row) => setSubs((prev) => [row, ...(prev ?? [])])} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-24 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs">
                          {s.url}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {s.events.map((ev) => (
                              <Badge
                                key={ev}
                                variant="outline"
                                className="font-mono text-[10px]"
                              >
                                {ev === '*' ? 'all events (*)' : ev}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <Switch
                              checked={s.active}
                              onCheckedChange={() => void toggleActive(s)}
                              disabled={busyId === s.id}
                              aria-label={s.active ? 'Pause deliveries' : 'Resume deliveries'}
                            />
                            <Badge
                              variant={s.active ? 'secondary' : 'outline'}
                              className={s.disabledAt ? 'border-destructive/50 text-destructive' : undefined}
                            >
                              {s.active ? 'Active' : s.disabledAt ? 'Switched off' : 'Paused'}
                            </Badge>
                          </span>
                          {s.disabledAt ? (
                            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                              Locavello switched it off {formatDate(s.disabledAt, true)}: {s.disabledReason}.
                              Fix the receiver, turn it back on, then retry the failed deliveries below.
                            </p>
                          ) : s.active && (s.consecutiveFailures ?? 0) > 0 ? (
                            <p className="mt-1 text-xs text-amber-400">
                              {s.consecutiveFailures} failed in a row since {formatDate(s.failingSince, true)}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(s.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground hover:text-destructive"
                                disabled={busyId === s.id}
                              >
                                {busyId === s.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : null}
                                Remove
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove this endpoint?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Deliveries to{' '}
                                  <code className="break-all font-mono text-xs">{s.url}</code>{' '}
                                  stop immediately. This can&apos;t be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => void remove(s)}>
                                  Remove endpoint
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {subs && subs.length > 0 ? <RecentDeliveries subscriptions={subs} onChanged={() => void load()} /> : null}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Event catalog</CardTitle>
            <CardDescription>
              Emitted from the transactional outbox. Subscribe to exact types, a prefix such as{' '}
              <code className="font-mono text-xs">locavello.release.*</code>, or all of them.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {catalog === null ? <Skeleton className="h-16 w-full" /> : null}
            {(catalog ?? []).map((e) => (
              <div key={e.type} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <code className="font-mono text-xs font-medium">{e.type}</code>
                <span className="text-xs text-muted-foreground">{e.description}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Verifying signatures</CardTitle>
            <CardDescription>
              Every delivery is an HTTPS POST of{' '}
              <code className="font-mono text-xs">{'{ id, type, occurredAt, accountId, data }'}</code> with a{' '}
              <code className="font-mono text-xs">Locavello-Signature</code> header. Recompute the
              HMAC over the raw body with your signing secret and compare — reject anything older than
              ~5 minutes. The SDKs do it for you: <code className="font-mono text-xs">verifyWebhook</code>{' '}
              (JS), <code className="font-mono text-xs">verify_webhook</code> (Python),{' '}
              <code className="font-mono text-xs">VerifyWebhook</code> (Go).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {`Locavello-Signature: t=<unix>,v1=<hex>

// Node.js
const crypto = require('node:crypto');
const [t, v1] = header.split(',').map((kv) => kv.split('=')[1]);
const expected = crypto
  .createHmac('sha256', WEBHOOK_SECRET)   // your whsec_… secret
  .update(\`\${t}.\${rawBody}\`)             // unix timestamp + "." + raw JSON body
  .digest('hex');
const valid =
  crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1)) &&
  Math.abs(Date.now() / 1000 - Number(t)) < 300;`}
            </pre>
            <p className="mt-2 text-xs text-muted-foreground">
              A <code className="font-mono">2xx</code> within 10 seconds is success; anything else is
              retried 1 min, 5 min, 25 min, 2 h and 12 h later (6 attempts). Delivery is at-least-once —
              drop duplicates by the event <code className="font-mono">id</code>. An endpoint that fails 20
              times in a row over a day is switched off and your other endpoints get{' '}
              <code className="font-mono">locavello.webhook_subscription.disabled.v1</code>. Details:{' '}
              <a href="/docs/webhooks" className="underline underline-offset-2">
                Webhooks docs
              </a>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The delivery log (GET /webhook-subscriptions/deliveries): what was sent to
 * each endpoint, every attempt, and a Retry for anything that is not pending.
 */
function RecentDeliveries({
  subscriptions,
  onChanged,
}: {
  subscriptions: WebhookSubscriptionRow[];
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<WebhookDeliveryRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<'' | WebhookDeliveryRow['status']>('');
  const [subscriptionId, setSubscriptionId] = useState('');
  const [open, setOpen] = useState<WebhookDeliveryRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const urlOf = useMemo(() => new Map(subscriptions.map((s) => [s.id, s.url])), [subscriptions]);

  const fetchPage = useCallback(
    async (after: string | null) => {
      setError(null);
      const q = new URLSearchParams({ limit: '20' });
      if (status) q.set('status', status);
      if (subscriptionId) q.set('subscriptionId', subscriptionId);
      if (after) q.set('cursor', after);
      try {
        const { data, meta } = await apiRequest<WebhookDeliveryRow[]>(
          `/webhook-subscriptions/deliveries?${q.toString()}`,
        );
        setRows((cur) => (after ? [...(cur ?? []), ...(data ?? [])] : (data ?? [])));
        setCursor(meta.cursor ?? null);
        setHasMore(Boolean(meta.hasMore));
      } catch (e) {
        setError(e);
        if (!after) setRows([]);
      }
    },
    [status, subscriptionId],
  );

  useEffect(() => {
    setRows(null);
    void fetchPage(null);
  }, [fetchPage]);

  async function retry(d: WebhookDeliveryRow) {
    setBusy(d.id);
    try {
      await apiRequest(`/webhook-subscriptions/deliveries/${d.id}/retry`, { method: 'POST', body: {} });
      toast.success('Queued — it goes out within a few seconds');
      await fetchPage(null);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't retry the delivery"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">Recent deliveries</CardTitle>
          <CardDescription>Every event sent to your endpoints, with each attempt.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={subscriptionId || 'all'} onValueChange={(v) => setSubscriptionId(v === 'all' ? '' : v)}>
            <SelectTrigger aria-label="Filter by endpoint" className="h-8 w-56 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All endpoints</SelectItem>
              {subscriptions.map((s) => (
                <SelectItem key={s.id} value={s.id} className="font-mono text-xs">
                  {s.url}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status || 'all'}
            onValueChange={(v) => setStatus(v === 'all' ? '' : (v as WebhookDeliveryRow['status']))}
          >
            <SelectTrigger aria-label="Filter by status" className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="succeeded">Succeeded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void fetchPage(null)} aria-label="Refresh deliveries">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? <p className="px-6 pb-3 text-sm text-destructive">{errorMessage(error)}</p> : null}
        {rows === null ? (
          <div className="space-y-2 p-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Endpoint</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Last response</TableHead>
                  <TableHead>Next retry</TableHead>
                  <TableHead className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => setOpen(d)}>
                    <TableCell>
                      <p className="font-mono text-xs">{d.type}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(d.createdAt, true)}</p>
                    </TableCell>
                    <TableCell className="max-w-[16rem] truncate font-mono text-xs">
                      {urlOf.get(d.subscriptionId) ?? d.subscriptionId}
                    </TableCell>
                    <TableCell>
                      <DeliveryStatus status={d.status} />
                    </TableCell>
                    <TableCell className="text-right text-xs">{d.attempts}</TableCell>
                    <TableCell
                      className="max-w-[14rem] truncate text-xs text-muted-foreground"
                      title={d.lastError ?? undefined}
                    >
                      {d.responseCode ? `HTTP ${d.responseCode}` : (d.lastError ?? '—')}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {d.status === 'pending' ? formatDate(d.nextRetryAt, true) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {d.status !== 'pending' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === d.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            void retry(d);
                          }}
                        >
                          {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          Retry
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {hasMore ? (
          <div className="border-t border-border p-3 text-center">
            <Button variant="outline" size="sm" onClick={() => void fetchPage(cursor)}>
              Load more
            </Button>
          </div>
        ) : null}
      </CardContent>

      <Dialog open={!!open} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <DialogContent className="sm:max-w-2xl">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono text-sm">{open.type}</DialogTitle>
                <DialogDescription>
                  Delivery <code className="font-mono text-xs">{open.id}</code> of event{' '}
                  <code className="font-mono text-xs">{open.eventId}</code> to{' '}
                  <span className="break-all font-mono text-xs">
                    {urlOf.get(open.subscriptionId) ?? open.subscriptionId}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <DeliveryStatus status={open.status} />
                {open.status === 'pending' && open.nextRetryAt ? (
                  <span>next attempt {formatDate(open.nextRetryAt, true)}</span>
                ) : null}
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {open.attemptLog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                          Not attempted yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      open.attemptLog.map((a) => (
                        <TableRow key={a.attemptNumber}>
                          <TableCell className="text-xs">{a.attemptNumber}</TableCell>
                          <TableCell className="whitespace-nowrap text-xs">{formatDate(a.attemptedAt, true)}</TableCell>
                          <TableCell className="text-xs">
                            <span className={a.status === 'succeeded' ? 'text-emerald-400' : 'text-destructive'}>
                              {a.responseCode ? `HTTP ${a.responseCode}` : (a.error ?? a.status)}
                            </span>
                            {a.nextRetryAt ? (
                              <span className="block text-muted-foreground">
                                retry at {formatDate(a.nextRetryAt, true)}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right text-xs">{a.durationMs} ms</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(null)}>
                  Close
                </Button>
                {open.status !== 'pending' ? (
                  <Button
                    disabled={busy === open.id}
                    onClick={async () => {
                      await retry(open);
                      setOpen(null);
                    }}
                  >
                    {busy === open.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Retry now
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

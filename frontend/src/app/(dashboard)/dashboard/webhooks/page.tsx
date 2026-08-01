'use client';

/*
 * /dashboard/webhooks — outbound event webhooks (outbox fan-out of the
 * locavello.* events). The signing secret (whsec_…) is shown ONCE at
 * creation; deliveries carry
 * `Locavello-Signature: t=<unix>,v1=<hmac-sha256(secret, t+"."+body)>`.
 */

import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Plus, TriangleAlert, Webhook } from 'lucide-react';
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
  WebhookSubscriptionRow,
} from '@/components/locavello/types';

/** The event types locavello actually emits through the outbox —
 *  mirror backend writeOutbox call sites; don't invent. */
const EVENT_CATALOG: Array<{ type: string; description: string }> = [
  { type: 'locavello.project.created.v1', description: 'A localization project was created.' },
  {
    type: 'locavello.release.published.v1',
    description: 'A locale catalog release was published (new content hash).',
  },
  {
    type: 'locavello.translation.approved.v1',
    description: 'A reviewer approved a translation.',
  },
  {
    type: 'locavello.billing.subscribed.v1',
    description: 'The workspace subscribed to or changed a billing plan.',
  },
];

async function copyToClipboard(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy — select and copy manually");
  }
}

function AddEndpointDialog({ onCreated }: { onCreated: (row: WebhookSubscriptionRow) => void }) {
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
                  ? EVENT_CATALOG.map((ev) => (
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
        actions={<AddEndpointDialog onCreated={(row) => setSubs((prev) => [row, ...(prev ?? [])])} />}
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
              <AddEndpointDialog onCreated={(row) => setSubs((prev) => [row, ...(prev ?? [])])} />
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
                            <Badge variant={s.active ? 'secondary' : 'outline'}>
                              {s.active ? 'Active' : 'Paused'}
                            </Badge>
                          </span>
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Event catalog</CardTitle>
            <CardDescription>Emitted from the transactional outbox.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {EVENT_CATALOG.map((e) => (
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
              <code className="font-mono text-xs">{'{ id, type, occurredAt, data }'}</code> with a{' '}
              <code className="font-mono text-xs">Locavello-Signature</code> header. Recompute the
              HMAC with your signing secret and compare — reject anything older than ~5 minutes.
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
              Delivery is at-most-once in v1 (failures are logged, not retried) — reconcile with{' '}
              <code className="font-mono">GET /api/v1/projects/:id/releases</code> if you need
              certainty.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';

/*
 * /dashboard/projects/[id]/review — the reviewer's queue. Pending
 * (machine / needs_review) translations with full key context; approve
 * or reject with a reason. Rows are removed optimistically and restored
 * if the API call fails.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ClipboardCheck, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ErrorPanel } from '@/components/ui/error-panel';
import { PageHeader } from '@/components/locavello/page-header';
import { TranslationStatusBadge } from '@/components/locavello/status-badge';
import { errorCode, errorMessage } from '@/components/locavello/format';
import type { ProjectDetail, ReviewRow } from '@/components/locavello/types';

function ReviewCard({
  row,
  sourceLocale,
  onApprove,
  onReject,
  busy,
}: {
  row: ReviewRow;
  sourceLocale: string;
  onApprove: () => void;
  onReject: () => void;
  busy: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all font-mono text-xs font-medium">{row.key.name}</code>
          <Badge variant="outline" className="font-mono text-xs">
            {row.key.namespace.name}
          </Badge>
          {row.key.namespace.reviewPolicy === 'gated' ? (
            <Badge variant="outline" className="border-primary/50 text-primary">
              gated
            </Badge>
          ) : null}
          <Badge variant="secondary" className="font-mono text-xs">
            {row.locale}
          </Badge>
          <TranslationStatusBadge status={row.status} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Source ({sourceLocale})
            </p>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2.5 font-mono text-sm">
              {row.key.sourceText}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
              Proposed ({row.locale})
            </p>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2.5 font-mono text-sm">
              {row.value}
            </p>
          </div>
        </div>
        {row.key.description ? (
          <p className="text-xs text-muted-foreground">{row.key.description}</p>
        ) : null}
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onApprove} disabled={busy}>
            <Check className="h-4 w-4" /> Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={onReject}
            disabled={busy}
          >
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReviewQueuePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [locale, setLocale] = useState<string>('all');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const load = useCallback(
    async (cur: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', '25');
      if (locale !== 'all') params.set('locale', locale);
      if (cur) params.set('cursor', cur);
      return apiRequest<ReviewRow[]>(`/projects/${id}/review-queue?${params.toString()}`);
    },
    [id, locale],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!project) {
        const { data } = await apiRequest<ProjectDetail>(`/projects/${id}`);
        setProject(data);
      }
      const { data, meta } = await load(null);
      setRows(data);
      setCursor(meta.cursor ?? null);
      setHasMore(Boolean(meta.hasMore));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data, meta } = await load(cursor);
      setRows((prev) => [...prev, ...data]);
      setCursor(meta.cursor ?? null);
      setHasMore(Boolean(meta.hasMore));
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't load more"));
    } finally {
      setLoadingMore(false);
    }
  }

  function removeOptimistically(row: ReviewRow) {
    const index = rows.findIndex((r) => r.id === row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    return () =>
      setRows((prev) => {
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, row);
        return next;
      });
  }

  async function approve(row: ReviewRow) {
    setBusyId(row.id);
    const restore = removeOptimistically(row);
    try {
      await apiRequest(`/translations/${row.id}/approve`, { method: 'POST' });
      toast.success(`Approved "${row.key.name}" (${row.locale})`);
    } catch (e) {
      restore();
      toast.error(errorMessage(e, "Couldn't approve — the row is back in the queue"));
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejecting) return;
    const row = rejecting;
    setRejectSubmitting(true);
    const restore = removeOptimistically(row);
    try {
      await apiRequest(`/translations/${row.id}/reject`, {
        method: 'POST',
        body: { reason: rejectReason.trim() },
      });
      toast.success(`Rejected "${row.key.name}" (${row.locale})`);
      setRejecting(null);
      setRejectReason('');
    } catch (e) {
      restore();
      toast.error(errorMessage(e, "Couldn't reject — the row is back in the queue"));
    } finally {
      setRejectSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      {project ? (
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {project.name}
        </Link>
      ) : null}
      <PageHeader
        title="Review queue"
        description="Machine output and flagged edits, oldest first. Approvals feed the translation memory."
        actions={
          project && project.locales.length > 0 ? (
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Locale" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All locales</SelectItem>
                {project.locales.map((l) => (
                  <SelectItem key={l.tag} value={l.tag}>
                    {l.tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null
        }
      />

      {error ? (
        <ErrorPanel
          title="Couldn't load the review queue"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void reload()}
        />
      ) : loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <ClipboardCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Queue&apos;s clear</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {locale === 'all'
                  ? 'Nothing waiting on a reviewer. New machine passes and flagged edits land here.'
                  : `Nothing pending for "${locale}". Try another locale or come back after the next machine pass.`}
              </p>
            </div>
            {project ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/projects/${project.id}/workbench`}>Open the workbench</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {rows.map((row) => (
            <ReviewCard
              key={row.id}
              row={row}
              sourceLocale={project?.sourceLocale ?? 'en'}
              busy={busyId === row.id}
              onApprove={() => void approve(row)}
              onReject={() => {
                setRejecting(row);
                setRejectReason('');
              }}
            />
          ))}
          {hasMore ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Load more
            </Button>
          ) : null}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open && !rejectSubmitting) setRejecting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject translation</DialogTitle>
            <DialogDescription>
              {rejecting ? (
                <>
                  <code className="font-mono text-xs">{rejecting.key.name}</code> ({rejecting.locale}
                  ) — the reason is kept as a training signal for the next pass.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Wrong register — this screen uses formal address."
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejecting(null)}
              disabled={rejectSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitReject()}
              disabled={rejectSubmitting || !rejectReason.trim()}
            >
              {rejectSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

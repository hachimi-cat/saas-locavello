'use client';

/*
 * /dashboard/audit — append-only workspace audit trail: who did what,
 * to which resource, when. Filterable by action + actor, free-text
 * search, cursor-paged. The depllo audit-page pattern.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollText, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
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
import { errorCode, errorMessage, relativeTime } from '@/components/locavello/format';
import { apiRequest } from '@/lib/api';
import type { AuditEventRow } from '@/components/locavello/types';

/** Mirror of the backend's recordAudit action vocabulary. */
const ACTIONS = [
  'project.created',
  'project.updated',
  'locale.added',
  'locale.updated',
  'namespace.created',
  'namespace.updated',
  'keys.extracted',
  'key.updated',
  'translation.updated',
  'translation.approved',
  'translation.rejected',
  'release.published',
  'glossary_term.created',
  'glossary_term.deleted',
  'api_key.created',
  'api_key.revoked',
  'webhook.created',
  'webhook.enabled',
  'webhook.disabled',
  'webhook.deleted',
  'job.queued',
] as const;

/** Color the action badge by verb family using theme tokens only. */
function actionBadgeClass(action: string): string {
  if (
    action.endsWith('.deleted') ||
    action.endsWith('.rejected') ||
    action.endsWith('.revoked') ||
    action.endsWith('.disabled')
  ) {
    return 'border-destructive/40 text-destructive';
  }
  if (
    action.endsWith('.created') ||
    action.endsWith('.added') ||
    action.endsWith('.published') ||
    action.endsWith('.approved') ||
    action.endsWith('.enabled')
  ) {
    return 'border-primary/40 text-primary';
  }
  return 'border-border text-muted-foreground';
}

function auditQuery(params: {
  cursor?: string;
  action?: string;
  actor?: string;
  q?: string;
}): string {
  const qs = new URLSearchParams();
  if (params.action) qs.set('action', params.action);
  if (params.actor) qs.set('actor', params.actor);
  if (params.q) qs.set('q', params.q);
  if (params.cursor) qs.set('cursor', params.cursor);
  const s = qs.toString();
  return `/audit${s ? `?${s}` : ''}`;
}

export default function AuditPage() {
  const [events, setEvents] = useState<AuditEventRow[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState<string>('all');
  const [actorInput, setActorInput] = useState('');
  const [actor, setActor] = useState('');
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce the text filters so we don't refetch per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setActor(actorInput.trim()), 400);
    return () => clearTimeout(t);
  }, [actorInput]);
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const load = useCallback(async () => {
    setError(null);
    setEvents(null);
    try {
      const { data, meta } = await apiRequest<AuditEventRow[]>(
        auditQuery({
          action: action === 'all' ? undefined : action,
          actor: actor || undefined,
          q: q || undefined,
        }),
      );
      setEvents(data ?? []);
      setCursor(meta.cursor ?? null);
      setHasMore(meta.hasMore ?? false);
    } catch (e) {
      setError(e);
    }
  }, [action, actor, q]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data, meta } = await apiRequest<AuditEventRow[]>(
        auditQuery({
          cursor,
          action: action === 'all' ? undefined : action,
          actor: actor || undefined,
          q: q || undefined,
        }),
      );
      setEvents((prev) => [...(prev ?? []), ...(data ?? [])]);
      setCursor(meta.cursor ?? null);
      setHasMore(meta.hasMore ?? false);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <ErrorPanel
          title="Couldn't load the audit log"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const filtered = action !== 'all' || actor !== '' || q !== '';

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader
        title="Audit log"
        description="Every change in this workspace — projects, translations, releases, keys and webhooks. Append-only."
      />

      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search events…"
              className="w-[240px] pl-8"
            />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {ACTIONS.map((a) => (
                <SelectItem key={a} value={a}>
                  <span className="font-mono text-xs">{a}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
            placeholder="Filter by actor…"
            className="w-[220px]"
          />
        </div>

        {events === null ? (
          <Card>
            <CardContent className="space-y-3 py-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : events.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <ScrollText className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-medium">No audit events{filtered ? ' match' : ' yet'}</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  {filtered
                    ? 'Try clearing the filters.'
                    : 'Workspace activity — creating projects, approving translations, publishing releases — shows up here.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[200px]">Action</TableHead>
                        <TableHead className="w-[180px]">Actor</TableHead>
                        <TableHead className="w-[220px]">Target</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead className="w-[110px] text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {events.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="pl-4">
                            <Badge
                              variant="outline"
                              className={`font-mono text-[11px] ${actionBadgeClass(e.action)}`}
                            >
                              {e.action}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="block truncate text-sm font-medium">
                              {e.actorLabel ?? e.actorSub}
                            </span>
                            {e.actorLabel ? (
                              <span className="block truncate font-mono text-xs text-muted-foreground">
                                {e.actorSub}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span className="block text-xs capitalize text-muted-foreground">
                              {e.targetType.replace(/_/g, ' ')}
                            </span>
                            <span className="block truncate font-mono text-xs">{e.targetId}</span>
                          </TableCell>
                          <TableCell className="text-sm">{e.summary}</TableCell>
                          <TableCell
                            className="text-right text-sm text-muted-foreground"
                            title={new Date(e.createdAt).toLocaleString()}
                          >
                            {relativeTime(e.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
            {hasMore ? (
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

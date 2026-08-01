'use client';

/*
 * /dashboard/projects/[id]/releases — publish per-locale catalogs and
 * inspect history. Publishing is idempotent on content: a replay comes
 * back 200 with unchanged:true and we say so instead of minting a row.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, GitCompareArrows, Loader2, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { errorCode, errorMessage, formatDate, shortHash } from '@/components/locavello/format';
import type {
  ProjectDetail,
  PublishedRelease,
  Release,
  ReleaseDiff,
} from '@/components/locavello/types';

function DiffDialog({
  pair,
  onClose,
}: {
  /** [previous, current] — diff is previous→current. */
  pair: [Release, Release] | null;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<ReleaseDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pair) {
      setDiff(null);
      setError(null);
      return;
    }
    let stale = false;
    apiRequest<ReleaseDiff>(`/projects/releases/${pair[0].id}/diff/${pair[1].id}`)
      .then(({ data }) => {
        if (!stale) setDiff(data);
      })
      .catch((e) => {
        if (!stale) setError(errorMessage(e, "Couldn't compute the diff"));
      });
    return () => {
      stale = true;
    };
  }, [pair]);

  const empty = diff && diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;

  return (
    <Dialog open={pair !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Release diff</DialogTitle>
          <DialogDescription>
            {pair ? (
              <>
                <span className="font-mono text-xs">{shortHash(pair[0].contentHash)}</span> (
                {formatDate(pair[0].createdAt)}) →{' '}
                <span className="font-mono text-xs">{shortHash(pair[1].contentHash)}</span> (
                {formatDate(pair[1].createdAt)}) · {pair[1].locale}
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : !diff ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : empty ? (
          <p className="py-4 text-sm text-muted-foreground">
            The two releases are identical key-for-key.
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {diff.added.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
                  Added ({diff.added.length})
                </p>
                <ul className="space-y-0.5">
                  {diff.added.map((k) => (
                    <li key={k} className="break-all font-mono text-xs text-primary">
                      + {k}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {diff.removed.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                  Removed ({diff.removed.length})
                </p>
                <ul className="space-y-0.5">
                  {diff.removed.map((k) => (
                    <li key={k} className="break-all font-mono text-xs text-destructive">
                      − {k}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {diff.changed.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Changed ({diff.changed.length})
                </p>
                <ul className="space-y-2">
                  {diff.changed.map((c) => (
                    <li key={c.key} className="font-mono text-xs">
                      <p className="break-all font-medium text-foreground">{c.key}</p>
                      <p className="break-all text-destructive">− {c.from}</p>
                      <p className="break-all text-primary">+ {c.to}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ReleasesPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [diffPair, setDiffPair] = useState<[Release, Release] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, r] = await Promise.all([
        apiRequest<ProjectDetail>(`/projects/${id}`),
        apiRequest<Release[]>(`/projects/${id}/releases?limit=50`),
      ]);
      setProject(p.data);
      setReleases(r.data);
      setCursor(r.meta.cursor ?? null);
      setHasMore(Boolean(r.meta.hasMore));
    } catch (e) {
      setError(e);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data, meta } = await apiRequest<Release[]>(
        `/projects/${id}/releases?limit=50&cursor=${encodeURIComponent(cursor)}`,
      );
      setReleases((prev) => [...(prev ?? []), ...data]);
      setCursor(meta.cursor ?? null);
      setHasMore(Boolean(meta.hasMore));
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't load more releases"));
    } finally {
      setLoadingMore(false);
    }
  }

  async function publish(locale: string) {
    setPublishing(locale);
    try {
      const { data } = await apiRequest<PublishedRelease>(`/projects/${id}/releases`, {
        method: 'POST',
        body: { locale },
      });
      if (data.unchanged) {
        toast.info(`"${locale}" is unchanged since its last release — nothing published.`);
      } else {
        toast.success(`Published "${locale}" — ${data.keyCount} keys.`);
        const { unchanged: _u, ...row } = data;
        setReleases((prev) => [row, ...(prev ?? [])]);
      }
    } catch (e) {
      toast.error(errorMessage(e, `Couldn't publish "${locale}"`));
    } finally {
      setPublishing(null);
    }
  }

  /** Previous release for the same locale within the loaded page. */
  function previousOf(release: Release): Release | null {
    if (!releases) return null;
    const idx = releases.findIndex((r) => r.id === release.id);
    if (idx < 0) return null;
    for (let i = idx + 1; i < releases.length; i += 1) {
      if (releases[i].locale === release.locale) return releases[i];
    }
    return null;
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <ErrorPanel
          title="Couldn't load releases"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  if (!project || releases === null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-8 w-48" />
        </div>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const enabledLocales = project.locales.filter((l) => l.enabled);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-6">
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {project.name}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Releases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A release freezes a locale&apos;s catalog. <code className="font-mono text-xs">locavello pull</code>{' '}
          ships the latest one; gated namespaces only ever release approved translations.
        </p>
      </header>

      <div className="space-y-6">
        {/* Publish */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Rocket className="h-4 w-4 text-muted-foreground" /> Publish
            </CardTitle>
            <CardDescription>
              Publishing the same content twice is a no-op — you&apos;ll be told it&apos;s unchanged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {enabledLocales.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No enabled target locales. Enable one on the project page to publish.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {enabledLocales.map((l) => (
                  <Button
                    key={l.tag}
                    variant="outline"
                    onClick={() => void publish(l.tag)}
                    disabled={publishing !== null}
                  >
                    {publishing === l.tag ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    Publish {l.tag}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">History</CardTitle>
          </CardHeader>
          <CardContent>
            {releases.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing published yet. The first publish freezes today&apos;s catalog and gives CI a
                stable artifact to pull.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Locale</TableHead>
                      <TableHead>Keys</TableHead>
                      <TableHead>Hash</TableHead>
                      <TableHead>Published</TableHead>
                      <TableHead>By</TableHead>
                      <TableHead className="text-right">Diff</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {releases.map((r) => {
                      const prev = previousOf(r);
                      return (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {r.locale}
                            </Badge>
                          </TableCell>
                          <TableCell>{r.keyCount}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {shortHash(r.contentHash)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {formatDate(r.createdAt, true)}
                          </TableCell>
                          <TableCell className="max-w-32 truncate text-xs text-muted-foreground">
                            {r.createdBy ?? '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!prev}
                              title={
                                prev
                                  ? `Diff against ${shortHash(prev.contentHash)}`
                                  : 'No earlier release for this locale in the loaded history'
                              }
                              onClick={() => prev && setDiffPair([prev, r])}
                            >
                              <GitCompareArrows className="h-4 w-4" />
                              vs previous
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {hasMore ? (
                  <Button
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => void loadMore()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Load more
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <DiffDialog pair={diffPair} onClose={() => setDiffPair(null)} />
    </div>
  );
}

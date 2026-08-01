'use client';

/*
 * /dashboard/tm — the account's translation memory. Browses the whole
 * memory on load (newest first, cursor-paged) — 742 entries must never
 * hide behind a search box — and narrows via cross-project search.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, DatabaseZap, Loader2, Search, X } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { errorCode, errorMessage } from '@/components/locavello/format';
import type { Project, TmEntry } from '@/components/locavello/types';

const PAGE_SIZE = 50;

export default function TmPage() {
  const [q, setQ] = useState('');
  const [target, setTarget] = useState('');
  // Browse state — the default view.
  const [entries, setEntries] = useState<TmEntry[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Search state — active while `searched` is non-null.
  const [results, setResults] = useState<TmEntry[] | null>(null);
  const [searched, setSearched] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    // Project names for the results table — best-effort.
    apiRequest<Project[]>('/projects?limit=100')
      .then(({ data }) => setProjects(data))
      .catch(() => setProjects([]));
  }, []);

  const browse = useCallback(async (nextCursor: string | null) => {
    if (nextCursor) setLoadingMore(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (nextCursor) params.set('cursor', nextCursor);
      const res = await apiRequest<TmEntry[]>(`/tm?${params.toString()}`);
      setEntries((prev) => (nextCursor ? [...(prev ?? []), ...res.data] : res.data));
      setCursor(res.meta?.cursor ?? null);
      setHasMore(Boolean(res.meta?.hasMore));
    } catch (e) {
      setError(e);
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void browse(null);
  }, [browse]);

  const projectName = (id: string | null) =>
    id === null ? '—' : (projects.find((p) => p.id === id)?.name ?? id);

  async function search() {
    const query = q.trim();
    if (!query) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query });
      if (target.trim()) params.set('target', target.trim());
      const { data } = await apiRequest<TmEntry[]>(`/tm/search?${params.toString()}`);
      setResults(data);
      setSearched(query);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  function clearSearch() {
    setResults(null);
    setSearched(null);
    setQ('');
  }

  const rows = searched !== null ? results : entries;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Translation memory"
        description="Every source/target pair your account has ever approved — browsable, searchable, reused by the workbench and the agent."
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search source or target text…"
            className="pl-8"
          />
        </div>
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="target locale (optional)"
          className="w-44 font-mono"
        />
        <Button type="submit" disabled={loading || !q.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
        {searched !== null && (
          <Button type="button" variant="outline" onClick={clearSearch}>
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </form>

      {error ? (
        <ErrorPanel
          title={searched !== null ? 'Search failed' : 'Could not load the memory'}
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => (searched !== null ? void search() : void browse(null))}
        />
      ) : loading || rows === null ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <DatabaseZap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {searched !== null ? `No matches for “${searched}”` : 'Your memory is empty'}
              </h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                {searched !== null
                  ? 'Try a shorter phrase, or clear the search to browse everything.'
                  : 'Every approval feeds the memory, and the workbench suggests matches automatically.'}
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
                      <TableHead className="min-w-56">Source → target</TableHead>
                      <TableHead>Locales</TableHead>
                      <TableHead>Quality</TableHead>
                      <TableHead>Project</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">{r.sourceText}</span>
                            <span className="flex items-start gap-1.5 text-sm">
                              <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              {r.targetText}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                          {r.sourceLocale} → {r.targetLocale}
                        </TableCell>
                        <TableCell>
                          {r.quality === 'approved' ? (
                            <Badge>approved</Badge>
                          ) : (
                            <Badge variant="secondary">machine</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-40 truncate text-sm text-muted-foreground">
                          {projectName(r.projectId)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {searched === null && hasMore && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" onClick={() => void browse(cursor)} disabled={loadingMore}>
                {loadingMore && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

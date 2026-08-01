'use client';

/*
 * /dashboard/tm — cross-project translation-memory search. Every
 * approved translation across the account lands here and is reusable
 * from any project's workbench.
 */

import { useEffect, useState } from 'react';
import { ArrowRight, DatabaseZap, Loader2, Search } from 'lucide-react';
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

export default function TmSearchPage() {
  const [q, setQ] = useState('');
  const [target, setTarget] = useState('');
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

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Translation memory"
        description="Search every source/target pair your account has ever approved."
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
      </form>

      {error ? (
        <ErrorPanel
          title="Search failed"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void search()}
        />
      ) : loading ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : results === null ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <DatabaseZap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Search your memory</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Every approval feeds the memory, and the workbench suggests matches automatically.
                Use this page to audit how a phrase has been translated before.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : results.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No memory entries match “{searched}”
              {target.trim() ? (
                <>
                  {' '}
                  for <code className="font-mono text-xs">{target.trim()}</code>
                </>
              ) : null}
              . Approve a few translations and try again.
            </p>
          </CardContent>
        </Card>
      ) : (
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
                  {results.map((r) => (
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
      )}
    </div>
  );
}

'use client';

/*
 * Glossary hits for the workbench context panel. Fetches the project's
 * glossary once (account-wide + project-scoped) and surfaces the terms
 * present in the selected key's source text — the same `includes`
 * matching the backend check report uses.
 */

import { useEffect, useMemo, useState } from 'react';
import { BookMarked } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { GlossaryTerm } from './types';

export function GlossaryHitsPanel({
  projectId,
  sourceText,
  targetLocale,
}: {
  projectId: string;
  sourceText: string;
  targetLocale: string | null;
}) {
  const [terms, setTerms] = useState<GlossaryTerm[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stale = false;
    setTerms(null);
    setFailed(false);
    apiRequest<GlossaryTerm[]>(`/glossary?projectId=${encodeURIComponent(projectId)}`)
      .then(({ data }) => {
        if (!stale) setTerms(data);
      })
      .catch(() => {
        if (!stale) setFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [projectId]);

  const hits = useMemo(() => {
    if (!terms) return [];
    return terms.filter(
      (t) =>
        sourceText.includes(t.term) &&
        (t.locale === null || t.locale === targetLocale),
    );
  }, [terms, sourceText, targetLocale]);

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <BookMarked className="h-3.5 w-3.5 text-muted-foreground" /> Glossary
      </h3>
      {failed ? (
        <p className="text-xs text-destructive">Glossary unavailable.</p>
      ) : terms === null ? (
        <Skeleton className="h-8 w-full" />
      ) : hits.length === 0 ? (
        <p className="text-xs text-muted-foreground">No glossary terms in this source text.</p>
      ) : (
        <ul className="space-y-1.5">
          {hits.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{t.term}</span>
              {t.translation ? (
                <>
                  <span className="text-muted-foreground">→</span>
                  <span>{t.translation}</span>
                </>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  do not translate
                </Badge>
              )}
              {t.note ? (
                <span className="w-full text-xs text-muted-foreground">{t.note}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

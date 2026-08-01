'use client';

/*
 * Translation-memory suggestions for the workbench context panel.
 * GET /tm/suggest with the key's source text + active target locale;
 * clicking a suggestion inserts it into the editor via onInsert.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from './format';
import type { TmEntry, TmSuggestions } from './types';

function QualityBadge({ quality }: { quality: TmEntry['quality'] }) {
  return quality === 'approved' ? (
    <Badge className="shrink-0">approved</Badge>
  ) : (
    <Badge variant="secondary" className="shrink-0">
      machine
    </Badge>
  );
}

function SuggestionButton({
  entry,
  exact,
  onInsert,
}: {
  entry: TmEntry;
  exact?: boolean;
  onInsert: (text: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onInsert(entry.targetText)}
      className={`w-full rounded-md border p-2 text-left transition-colors hover:bg-accent ${
        exact ? 'border-primary/60 bg-primary/5' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {exact ? (
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              Exact match
            </p>
          ) : (
            <p className="truncate text-xs text-muted-foreground">{entry.sourceText}</p>
          )}
          <p className="break-words text-sm">{entry.targetText}</p>
        </div>
        <QualityBadge quality={entry.quality} />
      </div>
    </button>
  );
}

export function TmSuggestionsPanel({
  sourceText,
  targetLocale,
  onInsert,
}: {
  sourceText: string;
  targetLocale: string | null;
  onInsert: (text: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<TmSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sourceText || !targetLocale) {
      setSuggestions(null);
      return;
    }
    let stale = false;
    setLoading(true);
    setError(null);
    apiRequest<TmSuggestions>(
      `/tm/suggest?text=${encodeURIComponent(sourceText)}&target=${encodeURIComponent(targetLocale)}`,
    )
      .then(({ data }) => {
        if (!stale) setSuggestions(data);
      })
      .catch((e) => {
        if (!stale) setError(errorMessage(e, 'Suggestions unavailable'));
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [sourceText, targetLocale]);

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Translation memory
      </h3>
      {!targetLocale ? (
        <p className="text-xs text-muted-foreground">Pick a target locale to see suggestions.</p>
      ) : loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !suggestions || (!suggestions.exact && suggestions.fuzzy.length === 0) ? (
        <p className="text-xs text-muted-foreground">
          No matches yet — approved translations feed the memory and come back here.
        </p>
      ) : (
        <div className="space-y-2">
          {suggestions.exact ? (
            <SuggestionButton entry={suggestions.exact} exact onInsert={onInsert} />
          ) : null}
          {suggestions.fuzzy.map((f) => (
            <SuggestionButton key={f.id} entry={f} onInsert={onInsert} />
          ))}
        </div>
      )}
    </div>
  );
}

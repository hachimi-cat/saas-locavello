'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Globe, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/*
 * Mode B instant preview — the hero's primary CTA.
 *
 * Async contract (agent runs take 30–90s, past any proxy timeout):
 *
 *   1. POST /api/v1/public/preview {url, targetLocale}
 *      → 202 {data: {previewId, url, targetLocale, stringsOnPage,
 *        previewedWords}} in a few seconds (fetch + extract + dispatch).
 *      Errors: 422 INVALID_URL / FETCH_FAILED / NO_TEXT,
 *      503 PREVIEW_BUDGET_EXHAUSTED, 400 VALIDATION_ERROR.
 *   2. Poll GET /api/v1/public/preview/<previewId> every ~3s
 *      → {status:'running'} | {status:'done', pairs} |
 *        {status:'failed', error}. Give up politely after ~180s.
 *
 * No signup — the preview IS the conversion mechanic. Every failure
 * mode degrades to an inline error while the classic CTAs stay
 * available.
 */

const LANGUAGES: Array<{ tag: string; label: string }> = [
  { tag: 'id', label: 'Bahasa Indonesia' },
  { tag: 'ms', label: 'Malay' },
  { tag: 'en', label: 'English' },
  { tag: 'es', label: 'Spanish' },
  { tag: 'pt-BR', label: 'Portuguese (Brazil)' },
  { tag: 'fr', label: 'French' },
  { tag: 'de', label: 'German' },
  { tag: 'ja', label: 'Japanese' },
  { tag: 'ko', label: 'Korean' },
  { tag: 'zh', label: 'Chinese (Simplified)' },
  { tag: 'ar', label: 'Arabic' },
  { tag: 'th', label: 'Thai' },
  { tag: 'vi', label: 'Vietnamese' },
  { tag: 'hi', label: 'Hindi' },
];

/** Friendly heading per API error code — the API's own message renders under it. */
const ERROR_HEADINGS: Record<string, string> = {
  INVALID_URL: 'That URL didn’t work',
  FETCH_FAILED: 'Couldn’t fetch that page',
  NO_TEXT: 'No translatable text found',
  PREVIEW_BUDGET_EXHAUSTED: 'The free preview is maxed out today',
  VALIDATION_ERROR: 'Check your input',
  RUN_FAILED: 'The translation run failed',
  TIMED_OUT: 'This is taking longer than usual',
};

const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 180_000;

interface PreviewPair {
  original: string;
  translated: string;
}

/** POST response data (202). */
interface PreviewDispatch {
  previewId: string;
  url: string;
  targetLocale: string;
  stringsOnPage: number;
  previewedWords: number;
}

interface ApiErrorShape {
  code: string;
  message: string;
}

type Phase = 'idle' | 'loading' | 'done' | 'error';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function HeroInstantPreview() {
  const [url, setUrl] = useState('');
  const [targetLocale, setTargetLocale] = useState('id');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<ApiErrorShape | null>(null);
  /** Set once the POST succeeds — drives the honest progress copy. */
  const [dispatch, setDispatch] = useState<PreviewDispatch | null>(null);
  const [pairs, setPairs] = useState<PreviewPair[] | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Bumped on reset/unmount so an in-flight run stops touching state. */
  const runSeq = useRef(0);

  useEffect(() => {
    return () => {
      runSeq.current += 1;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function runPreview(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || phase === 'loading') return;

    const seq = ++runSeq.current;
    setPhase('loading');
    setError(null);
    setDispatch(null);
    setPairs(null);
    setElapsed(0);
    stopTimer();
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

    const fail = (err: ApiErrorShape) => {
      if (runSeq.current !== seq) return;
      stopTimer();
      setError(err);
      setPhase('error');
    };

    // ── 1. Dispatch ──────────────────────────────────────────────────
    let dispatched: PreviewDispatch;
    try {
      const res = await fetch('/api/v1/public/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmed, targetLocale }),
        signal: AbortSignal.timeout(30_000),
      });
      let body: { data?: PreviewDispatch; error?: ApiErrorShape | null } | null = null;
      try {
        body = await res.json();
      } catch {
        // non-JSON response — handled below
      }
      if (!res.ok || !body?.data?.previewId) {
        return fail(
          body?.error ?? {
            code: 'FETCH_FAILED',
            message: 'the preview service returned an unexpected response — try again',
          },
        );
      }
      dispatched = body.data;
    } catch {
      return fail({
        code: 'NETWORK',
        message: 'could not reach the preview service — check your connection and try again',
      });
    }
    if (runSeq.current !== seq) return;
    setDispatch(dispatched);

    // ── 2. Poll ──────────────────────────────────────────────────────
    const deadline = Date.now() + POLL_DEADLINE_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      if (runSeq.current !== seq) return;
      let poll: {
        data?: { status: string; pairs?: PreviewPair[]; error?: string | null };
        error?: ApiErrorShape | null;
      } | null = null;
      try {
        const res = await fetch(
          `/api/v1/public/preview/${encodeURIComponent(dispatched.previewId)}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        try {
          poll = await res.json();
        } catch {
          // transient bad body — keep polling until the deadline
        }
        if (res.status === 404) {
          return fail(
            poll?.error ?? {
              code: 'RUN_FAILED',
              message: 'the preview run went missing — try again',
            },
          );
        }
      } catch {
        continue; // transient network error — keep polling
      }
      if (runSeq.current !== seq) return;
      const status = poll?.data?.status;
      if (status === 'done') {
        stopTimer();
        setPairs(poll?.data?.pairs ?? []);
        setPhase('done');
        return;
      }
      if (status === 'failed') {
        return fail({
          code: 'RUN_FAILED',
          message: poll?.data?.error || 'the translation run failed — try again',
        });
      }
      // 'running' (or a transient non-answer) — keep polling.
    }
    fail({
      code: 'TIMED_OUT',
      message: 'the agent is still working, but we stopped waiting — try again in a minute',
    });
  }

  function reset() {
    runSeq.current += 1;
    stopTimer();
    setPhase('idle');
    setError(null);
    setDispatch(null);
    setPairs(null);
    setElapsed(0);
  }

  const targetLabel =
    LANGUAGES.find((l) => l.tag === (dispatch?.targetLocale ?? targetLocale))?.label ??
    (dispatch?.targetLocale ?? targetLocale);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form
        onSubmit={runPreview}
        className="rounded-xl border border-border bg-card shadow-lg shadow-primary/5 p-3 md:p-4"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Globe
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              type="text"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="yoursite.com"
              aria-label="Website URL to preview"
              disabled={phase === 'loading'}
              className="h-10 pl-9"
            />
          </div>
          <Select
            value={targetLocale}
            onValueChange={setTargetLocale}
            disabled={phase === 'loading'}
          >
            <SelectTrigger aria-label="Target language" className="h-10 sm:w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.tag} value={l.tag}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            disabled={phase === 'loading' || url.trim().length === 0}
            className="h-10 px-5 gap-1.5 font-semibold"
          >
            {phase === 'loading' ? (
              <>
                <Loader2 className="size-4 animate-spin" strokeWidth={2} />
                Translating…
              </>
            ) : (
              <>
                Preview it
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </>
            )}
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] text-muted-foreground text-left">
          Free instant preview — no account needed. We fetch the page, translate its first
          strings with the agent, and show you the result.
        </p>
      </form>

      {phase === 'loading' && (
        <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center">
          <Loader2 className="size-5 animate-spin mx-auto text-primary" strokeWidth={2} />
          <p className="mt-3 text-sm text-foreground font-medium">
            {!dispatch
              ? 'Fetching your page and extracting its text…'
              : elapsed < 60
                ? `Found ${dispatch.stringsOnPage} strings — the agent is translating the first ${dispatch.previewedWords} words into ${targetLabel}. Usually under a minute.`
                : 'Still working — agent runs occasionally take a couple of minutes.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">{elapsed}s elapsed</p>
        </div>
      )}

      {phase === 'error' && error && (
        <div className="mt-4 rounded-xl border border-border bg-card p-6 text-left">
          <p className="text-sm font-semibold text-foreground">
            {ERROR_HEADINGS[error.code] ?? 'Something went wrong'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-medium border border-border bg-card hover:bg-muted transition-colors"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.5} />
              Try again
            </button>
            <span className="text-xs text-muted-foreground">
              Or start in the dashboard instead — the classic route below still works.
            </span>
          </div>
        </div>
      )}

      {phase === 'done' && dispatch && pairs && (
        <div className="mt-4 rounded-xl border border-border bg-card overflow-hidden text-left">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 bg-muted/50">
            <span className="text-[12px] text-muted-foreground font-mono truncate">
              {dispatch.url}
            </span>
            <span className="shrink-0 text-[11px] font-medium text-primary">
              → {targetLabel}
            </span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-1/2">
                    Original
                  </th>
                  <th className="text-left px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-primary w-1/2">
                    {targetLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {pairs.map((pair, i) => (
                  <tr key={i} className="border-b border-border last:border-b-0 align-top">
                    <td className="px-4 py-2.5 text-[13px] text-muted-foreground leading-snug">
                      {pair.original}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-foreground leading-snug">
                      {pair.translated}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Previewed {pairs.length} of {dispatch.stringsOnPage} strings found on the
              page. Sign up to crawl the whole site, review every string, and publish.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-xs font-medium border border-border bg-card hover:bg-muted transition-colors"
              >
                <RotateCcw className="size-3.5" strokeWidth={1.5} />
                Another page
              </button>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Sign up to keep this
                <ArrowRight className="size-4" strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

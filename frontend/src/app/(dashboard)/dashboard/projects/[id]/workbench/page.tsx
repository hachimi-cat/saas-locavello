'use client';

/*
 * /dashboard/projects/[id]/workbench — the translator's core screen.
 * Three panes: key list (filters + cursor paging), the editor for the
 * active locale, and the context panel (key metadata, usage sites, TM
 * suggestions, glossary hits). The active locale persists in the URL
 * (?locale=) so links land on the right language.
 */

import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, FileText, Loader2, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ApiRequestError, apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ErrorPanel } from '@/components/ui/error-panel';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/locavello/page-header';
import { StatusDot, TranslationStatusBadge } from '@/components/locavello/status-badge';
import { queueMachinePass } from '@/components/locavello/jobs';
import { TmSuggestionsPanel } from '@/components/locavello/tm-suggestions';
import { GlossaryHitsPanel } from '@/components/locavello/glossary-hits';
import {
  errorCode,
  errorMessage,
  estimateDisplayLength,
} from '@/components/locavello/format';
import type {
  KeyRow,
  KeyUsage,
  ProjectDetail,
  SavedTranslation,
  TranslationStatus,
} from '@/components/locavello/types';

type StatusFilter = 'missing' | 'machine' | 'needs_review' | 'approved';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'missing', label: 'Missing' },
  { value: 'machine', label: 'Machine' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'approved', label: 'Approved' },
];

function keyStatus(key: KeyRow): TranslationStatus | 'missing' {
  return key.translations[0]?.status ?? 'missing';
}

// ── Center pane: the translation editor ───────────────────────────────

function TranslationEditor({
  keyRow,
  locale,
  rtl,
  sourceLocale,
  value,
  onChange,
  onSaved,
}: {
  keyRow: KeyRow;
  locale: string;
  rtl: boolean;
  sourceLocale: string;
  /** Draft value lives in the parent so TM suggestions can insert into it. */
  value: string;
  onChange: (v: string) => void;
  onSaved: (tr: SavedTranslation) => void;
}) {
  const [saving, setSaving] = useState<'needs_review' | 'approved' | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const placeholders = Array.isArray(keyRow.placeholders) ? keyRow.placeholders : [];
  const estimated = estimateDisplayLength(value);
  const overBudget = keyRow.maxLength !== null && estimated > keyRow.maxLength;
  const current = keyRow.translations[0];

  async function save(status: 'needs_review' | 'approved') {
    setSaving(status);
    setInlineError(null);
    try {
      const { data } = await apiRequest<SavedTranslation>(
        `/keys/${keyRow.id}/translations/${encodeURIComponent(locale)}`,
        { method: 'PUT', body: { value, status } },
      );
      onSaved(data);
      if (data.lengthWarning) {
        toast.warning(
          `Saved, but over the length budget (~${data.lengthWarning.estimated} vs max ${data.lengthWarning.maxLength}).`,
        );
      } else {
        toast.success(status === 'approved' ? 'Saved and approved' : 'Saved for review');
      }
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'PLACEHOLDER_MISMATCH') {
        setInlineError(e.message);
      } else {
        toast.error(errorMessage(e, 'Save failed — your draft is untouched'));
      }
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="break-all font-mono text-sm font-medium">{keyRow.name}</code>
        <Badge variant="outline" className="font-mono text-xs">
          {keyRow.namespace.name}
        </Badge>
        {keyRow.namespace.reviewPolicy === 'gated' ? (
          <Badge variant="outline" className="border-primary/50 text-primary">
            gated
          </Badge>
        ) : null}
        <TranslationStatusBadge status={current?.status ?? 'missing'} />
      </div>

      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Source ({sourceLocale})
        </Label>
        <div className="mt-1.5 whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-3 font-mono text-sm">
          {keyRow.sourceText}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label
            htmlFor="wb-target"
            className="text-xs uppercase tracking-wide text-muted-foreground"
          >
            Translation ({locale})
          </Label>
          <span
            className={cn(
              'font-mono text-xs',
              overBudget ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {keyRow.maxLength !== null ? `~${estimated} / ${keyRow.maxLength}` : `~${estimated} chars`}
          </span>
        </div>
        {placeholders.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {placeholders.map((p) => (
              <Badge key={p} variant="outline" className="font-mono text-xs">
                {'{'}
                {p}
                {'}'}
              </Badge>
            ))}
          </div>
        ) : null}
        <Textarea
          id="wb-target"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setInlineError(null);
          }}
          dir={rtl ? 'rtl' : undefined}
          rows={6}
          placeholder={`Translate into ${locale}…`}
          className={cn('mt-1.5 font-mono', inlineError && 'border-destructive')}
        />
        {inlineError ? <p className="mt-1.5 text-sm text-destructive">{inlineError}</p> : null}
        {current?.status === 'rejected' && current.rejectedReason ? (
          <p className="mt-1.5 text-sm text-muted-foreground">
            <span className="text-destructive">Rejected:</span> {current.rejectedReason}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => void save('needs_review')}
          disabled={saving !== null}
        >
          {saving === 'needs_review' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save
        </Button>
        <Button onClick={() => void save('approved')} disabled={saving !== null}>
          {saving === 'approved' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Save &amp; approve
        </Button>
      </div>
    </div>
  );
}

// ── Right pane: key context (description, maxLength, usages) ──────────

function KeyContextCard({
  keyRow,
  onPatched,
}: {
  keyRow: KeyRow;
  onPatched: (fields: { description: string | null; maxLength: number | null }) => void;
}) {
  const [description, setDescription] = useState(keyRow.description ?? '');
  const [maxLength, setMaxLength] = useState(
    keyRow.maxLength !== null ? String(keyRow.maxLength) : '',
  );
  const [saving, setSaving] = useState(false);

  const parsedMax = maxLength.trim() === '' ? null : Number.parseInt(maxLength, 10);
  const maxInvalid = parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax <= 0);
  const dirty =
    description !== (keyRow.description ?? '') ||
    (parsedMax ?? null) !== (keyRow.maxLength ?? null);

  async function save() {
    if (maxInvalid) return;
    setSaving(true);
    try {
      await apiRequest(`/keys/${keyRow.id}`, {
        method: 'PATCH',
        body: { description: description.trim() === '' ? null : description, maxLength: parsedMax },
      });
      onPatched({ description: description.trim() === '' ? null : description, maxLength: parsedMax });
      toast.success('Key context updated');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't update key context"));
    } finally {
      setSaving(false);
    }
  }

  const usages: KeyUsage[] = Array.isArray(keyRow.context?.usages)
    ? (keyRow.context.usages as KeyUsage[])
    : [];

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="ctx-desc" className="text-xs uppercase tracking-wide text-muted-foreground">
          Description
        </Label>
        <Textarea
          id="ctx-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="What this string is for, tone hints…"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="ctx-max" className="text-xs uppercase tracking-wide text-muted-foreground">
          Max length
        </Label>
        <Input
          id="ctx-max"
          value={maxLength}
          onChange={(e) => setMaxLength(e.target.value)}
          inputMode="numeric"
          placeholder="no budget"
          className={cn('mt-1.5 w-28 font-mono', maxInvalid && 'border-destructive')}
        />
        {maxInvalid ? (
          <p className="mt-1 text-xs text-destructive">Must be a positive number.</p>
        ) : null}
      </div>
      {dirty ? (
        <Button size="sm" variant="outline" onClick={() => void save()} disabled={saving || maxInvalid}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save context
        </Button>
      ) : null}

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" /> Used at
        </h3>
        {usages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No usage sites recorded — <code className="font-mono">extract</code> fills these in.
          </p>
        ) : (
          <ul className="space-y-1">
            {usages.map((u, i) => (
              <li key={i} className="break-all font-mono text-xs text-muted-foreground">
                {u.file}:{u.line}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── The page ──────────────────────────────────────────────────────────

function WorkbenchInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projectError, setProjectError] = useState<unknown>(null);

  const [locale, setLocale] = useState<string | null>(null);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [namespace, setNamespace] = useState<string>('all');
  const [status, setStatus] = useState<StatusFilter | null>(null);

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<unknown>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const localeInitialized = useRef(false);

  const loadProject = useCallback(async () => {
    setProjectError(null);
    try {
      const { data } = await apiRequest<ProjectDetail>(`/projects/${id}`);
      setProject(data);
    } catch (e) {
      setProjectError(e);
    }
  }, [id]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  // Resolve the active locale once the project arrives: URL wins when
  // valid, else the first enabled target locale.
  useEffect(() => {
    if (!project || localeInitialized.current) return;
    localeInitialized.current = true;
    const fromUrl = searchParams.get('locale');
    const valid = fromUrl && project.locales.some((l) => l.tag === fromUrl) ? fromUrl : null;
    const chosen =
      valid ?? project.locales.find((l) => l.enabled)?.tag ?? project.locales[0]?.tag ?? null;
    setLocale(chosen);
    if (chosen && chosen !== fromUrl) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('locale', chosen);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }
  }, [project, searchParams, pathname, router]);

  function changeLocale(tag: string) {
    setLocale(tag);
    const params = new URLSearchParams(searchParams.toString());
    params.set('locale', tag);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Debounced search.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const buildQuery = useCallback(
    (cur: string | null) => {
      const params = new URLSearchParams();
      params.set('limit', '50');
      if (q) params.set('q', q);
      if (namespace !== 'all') params.set('namespace', namespace);
      if (locale) {
        params.set('locale', locale);
        if (status) params.set('status', status);
      }
      if (cur) params.set('cursor', cur);
      return params.toString();
    },
    [q, namespace, locale, status],
  );

  // (Re)load the list whenever a filter changes. Waits for the project
  // so the default locale is resolved before the first fetch.
  useEffect(() => {
    if (!project) return;
    // The locale-init effect is about to pick a default — skip the
    // locale-less fetch that would otherwise flash in first.
    if (project.locales.length > 0 && locale === null) return;
    let stale = false;
    setListLoading(true);
    setListError(null);
    apiRequest<KeyRow[]>(`/projects/${id}/keys?${buildQuery(null)}`)
      .then(({ data, meta }) => {
        if (stale) return;
        setKeys(data);
        setCursor(meta.cursor ?? null);
        setHasMore(Boolean(meta.hasMore));
        setSelectedId((prev) =>
          prev && data.some((k) => k.id === prev) ? prev : (data[0]?.id ?? null),
        );
      })
      .catch((e) => {
        if (!stale) setListError(e);
      })
      .finally(() => {
        if (!stale) setListLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [project, id, buildQuery]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const { data, meta } = await apiRequest<KeyRow[]>(`/projects/${id}/keys?${buildQuery(cursor)}`);
      setKeys((prev) => [...prev, ...data]);
      setCursor(meta.cursor ?? null);
      setHasMore(Boolean(meta.hasMore));
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't load more keys"));
    } finally {
      setLoadingMore(false);
    }
  }

  const selected = useMemo(
    () => keys.find((k) => k.id === selectedId) ?? null,
    [keys, selectedId],
  );
  const activeLocaleRow = project?.locales.find((l) => l.tag === locale) ?? null;

  // Draft translation for the selected key+locale — held here so the
  // TM panel can insert into it. Re-seeds when the selection changes.
  const [draft, setDraft] = useState('');
  const draftKey = `${selectedId ?? ''}:${locale ?? ''}`;
  const seededDraftKey = useRef<string | null>(null);
  useEffect(() => {
    if (seededDraftKey.current === draftKey) return;
    seededDraftKey.current = draftKey;
    setDraft(selected?.translations[0]?.value ?? '');
  }, [draftKey, selected]);

  function patchKeyInList(keyId: string, patch: Partial<KeyRow>) {
    setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, ...patch } : k)));
  }

  // Header shortcut: queue a machine pass for the active locale. The
  // job list lives on the project page — no polling here.
  const [queueingPass, setQueueingPass] = useState(false);
  async function machineTranslateLocale() {
    if (!project || !locale) return;
    setQueueingPass(true);
    await queueMachinePass(project.id, locale);
    setQueueingPass(false);
  }

  if (projectError) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <ErrorPanel
          title="Couldn't load project"
          message={errorMessage(projectError)}
          code={errorCode(projectError)}
          onRetry={() => void loadProject()}
        />
      </div>
    );
  }

  if (!project) {
    return <WorkbenchSkeleton />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {project.name}
      </Link>
      <PageHeader
        title="Workbench"
        actions={
          locale && activeLocaleRow && activeLocaleRow.missing > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={queueingPass}
              title={`Queue an agent pass over the ${activeLocaleRow.missing} untranslated keys — the word estimate is shown before it runs`}
              onClick={() => void machineTranslateLocale()}
            >
              {queueingPass ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              Machine translate {locale} ({activeLocaleRow.missing} missing)
            </Button>
          ) : null
        }
      />

      {project.locales.length === 0 ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm text-muted-foreground">
              This project has no target locales yet — add one to start translating.
            </p>
            <Button asChild size="sm">
              <Link href={`/dashboard/projects/${project.id}`}>Add a locale</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Filter bar */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search keys and source text…"
              className="pl-8"
            />
          </div>
          <Select value={namespace} onValueChange={setNamespace}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Namespace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All namespaces</SelectItem>
              {project.namespaces.map((ns) => (
                <SelectItem key={ns.id} value={ns.name}>
                  {ns.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {project.locales.length > 0 ? (
            <Select value={locale ?? undefined} onValueChange={changeLocale}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Locale" />
              </SelectTrigger>
              <SelectContent>
                {project.locales.map((l) => (
                  <SelectItem key={l.tag} value={l.tag}>
                    {l.tag}
                    {l.enabled ? '' : ' (disabled)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        {locale ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_FILTERS.map((f) => {
              const active = status === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setStatus(active ? null : f.value)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        {/* Left: key list */}
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-border px-4 py-3">
            <CardTitle className="text-sm">
              Keys{' '}
              <span className="font-normal text-muted-foreground">
                {listLoading ? '' : `(${keys.length}${hasMore ? '+' : ''})`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-80 overflow-y-auto lg:max-h-[calc(100vh-20rem)]">
              {listError ? (
                <div className="p-3">
                  <p className="text-sm text-destructive">{errorMessage(listError)}</p>
                </div>
              ) : listLoading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : keys.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {q || status || namespace !== 'all'
                    ? 'Nothing matches these filters.'
                    : 'No keys yet — run `locavello extract` (or PUT /keys) to load your strings.'}
                </p>
              ) : (
                <ul>
                  {keys.map((k) => (
                    <li key={k.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(k.id)}
                        className={cn(
                          'w-full border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-accent',
                          k.id === selectedId && 'bg-accent',
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <code className="truncate font-mono text-xs">{k.name}</code>
                          {locale ? <StatusDot status={keyStatus(k)} /> : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {k.sourceText}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {hasMore && !listLoading ? (
              <div className="border-t border-border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Center: editor */}
        <Card>
          <CardContent className="p-4 md:p-6">
            {!selected ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                {listLoading ? 'Loading…' : 'Select a key from the list to start translating.'}
              </p>
            ) : !locale ? (
              <div className="space-y-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Add a target locale to edit translations. The source text is shown in the context
                  panel meanwhile.
                </p>
              </div>
            ) : (
              <TranslationEditor
                key={`${selected.id}:${locale}`}
                keyRow={selected}
                locale={locale}
                rtl={activeLocaleRow?.rtl ?? false}
                sourceLocale={project.sourceLocale}
                value={draft}
                onChange={setDraft}
                onSaved={(tr) => {
                  const { lengthWarning: _lw, ...row } = tr;
                  patchKeyInList(selected.id, { translations: [row] });
                }}
              />
            )}
          </CardContent>
        </Card>

        {/* Right: context panel */}
        <Card>
          <CardContent className="space-y-4 p-4">
            {!selected ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Key context, TM suggestions, and glossary hits show up here.
              </p>
            ) : (
              <>
                <KeyContextCard
                  key={selected.id}
                  keyRow={selected}
                  onPatched={(fields) => patchKeyInList(selected.id, fields)}
                />
                <Separator />
                <TmSuggestionsPanel
                  sourceText={selected.sourceText}
                  targetLocale={locale}
                  onInsert={(text) => setDraft(text)}
                />
                <Separator />
                <GlossaryHitsPanel
                  projectId={project.id}
                  sourceText={selected.sourceText}
                  targetLocale={locale}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WorkbenchSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl">
      <Skeleton className="mb-2 h-4 w-32" />
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="mb-4 flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
}

export default function WorkbenchPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<WorkbenchSkeleton />}>
      <WorkbenchInner />
    </Suspense>
  );
}

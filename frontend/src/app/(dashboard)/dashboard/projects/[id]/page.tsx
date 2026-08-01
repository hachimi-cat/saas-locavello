'use client';

/*
 * /dashboard/projects/[id] — project home: locales, namespaces, last
 * release, and the mechanical Check report.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Globe2,
  ListChecks,
  Loader2,
  Plus,
  Rocket,
  SquarePen,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { CompletionBar } from '@/components/locavello/completion-bar';
import { PageHeader } from '@/components/locavello/page-header';
import { errorCode, errorMessage, formatDate } from '@/components/locavello/format';
import { queueCrawl, queueMachinePass } from '@/components/locavello/jobs';
import type {
  CheckIssue,
  CheckReport,
  LocaleStat,
  Namespace,
  ProjectDetail,
  ReviewPolicy,
  SitePage,
  TranslationJob,
} from '@/components/locavello/types';

// ── Add-locale dialog ─────────────────────────────────────────────────

function AddLocaleDialog({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: (locale: LocaleStat) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [fallback, setFallback] = useState('');
  const [rtl, setRtl] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setInlineError(null);
    try {
      const { data } = await apiRequest<LocaleStat>(`/projects/${projectId}/locales`, {
        method: 'POST',
        body: {
          tag: tag.trim(),
          fallback: fallback.trim() ? fallback.trim() : null,
          rtl,
        },
      });
      toast.success(`Locale "${data.tag}" added`);
      // POST returns the bare ProjectLocale — zero-fill the counters.
      onAdded({ ...data, keyCount: 0, approved: 0, machine: 0, needsReview: 0, missing: 0 });
      setOpen(false);
      setTag('');
      setFallback('');
      setRtl(false);
    } catch (e) {
      setInlineError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" /> Add locale
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add target locale</DialogTitle>
          <DialogDescription>BCP-47 tag, e.g. “id”, “ja”, or “pt-BR”.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="al-tag">Locale tag</Label>
            <Input
              id="al-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="id"
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="al-fallback">Fallback (optional)</Label>
            <Input
              id="al-fallback"
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              placeholder="falls through to the source locale"
              className="font-mono"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div>
              <Label htmlFor="al-rtl">Right-to-left</Label>
              <p className="text-xs text-muted-foreground">Arabic, Hebrew, Farsi, …</p>
            </div>
            <Switch id="al-rtl" checked={rtl} onCheckedChange={setRtl} />
          </div>
          {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !tag.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add locale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add-namespace dialog ──────────────────────────────────────────────

function AddNamespaceDialog({
  projectId,
  onAdded,
}: {
  projectId: string;
  onAdded: (ns: Namespace) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [reviewPolicy, setReviewPolicy] = useState<ReviewPolicy>('standard');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setInlineError(null);
    try {
      const { data } = await apiRequest<Namespace>(`/projects/${projectId}/namespaces`, {
        method: 'POST',
        body: { name: name.trim(), reviewPolicy },
      });
      toast.success(`Namespace "${data.name}" added`);
      onAdded(data);
      setOpen(false);
      setName('');
      setReviewPolicy('standard');
    } catch (e) {
      setInlineError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4" /> Add namespace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add namespace</DialogTitle>
          <DialogDescription>
            Gated namespaces (legal, pricing) release approved translations only.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="an-name">Name</Label>
            <Input
              id="an-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="checkout"
              className="font-mono"
            />
          </div>
          <div className="grid gap-2">
            <Label>Review policy</Label>
            <Select value={reviewPolicy} onValueChange={(v) => setReviewPolicy(v as ReviewPolicy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">standard — machine output can ship</SelectItem>
                <SelectItem value="gated">gated — approved-only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !name.trim()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add namespace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Check card ────────────────────────────────────────────────────────

function issueDetail(issue: CheckIssue): string {
  switch (issue.type) {
    case 'missing_key':
      return 'no translation';
    case 'placeholder_mismatch':
      return `placeholders — missing: [${(issue.missing ?? []).join(', ')}], extra: [${(issue.extra ?? []).join(', ')}]`;
    case 'length_overflow':
      return `length ~${issue.estimated} > max ${issue.maxLength}`;
    case 'glossary_violation':
      return `glossary term "${issue.term}" lost in translation`;
    case 'unreviewed':
      return `status: ${issue.status}`;
    default:
      return issue.type;
  }
}

function IssueList({ issues, tone }: { issues: CheckIssue[]; tone: 'error' | 'warning' }) {
  const MAX = 100;
  return (
    <ul className="space-y-1">
      {issues.slice(0, MAX).map((issue, i) => (
        <li key={i} className="font-mono text-xs">
          <span className={tone === 'error' ? 'text-destructive' : 'text-primary'}>
            {issue.type}
          </span>{' '}
          <span className="text-muted-foreground">[{issue.locale ?? '—'}]</span>{' '}
          <span className="text-foreground">{issue.key ?? ''}</span>{' '}
          <span className="text-muted-foreground">· {issueDetail(issue)}</span>
        </li>
      ))}
      {issues.length > MAX ? (
        <li className="text-xs text-muted-foreground">…and {issues.length - MAX} more</li>
      ) : null}
    </ul>
  );
}

function CheckCard({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<CheckReport | null>(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function run() {
    setRunning(true);
    try {
      const { data } = await apiRequest<CheckReport>(`/projects/${projectId}/check`);
      setReport(data);
      setExpanded(false);
    } catch (e) {
      toast.error(errorMessage(e, 'Check failed to run'));
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" /> Check
            </CardTitle>
            <CardDescription>
              The CI gate: missing keys, placeholder mismatches, length overflows, glossary
              violations.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {report ? 'Re-run' : 'Run check'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-sm text-muted-foreground">
            Run the same report <code className="font-mono text-xs">locavello check</code> uses to
            gate your builds.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {report.ok ? (
                <Badge className="gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Passing
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="h-3 w-3" /> Failing
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {report.errors.length} errors · {report.warnings.length} warnings ·{' '}
                {report.stats.keys} keys × {report.stats.locales} locales
              </span>
            </div>
            {report.errors.length > 0 || report.warnings.length > 0 ? (
              <div>
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  {expanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  {expanded ? 'Hide details' : 'Show details'}
                </button>
                {expanded ? (
                  <div className="mt-3 max-h-80 space-y-4 overflow-y-auto rounded-md border border-border bg-background p-3">
                    {report.errors.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-destructive">
                          Errors
                        </p>
                        <IssueList issues={report.errors} tone="error" />
                      </div>
                    ) : null}
                    {report.warnings.length > 0 ? (
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                          Warnings
                        </p>
                        <IssueList issues={report.warnings} tone="warning" />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Everything ships clean.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Jobs card ─────────────────────────────────────────────────────────

const JOB_KIND_LABEL: Record<TranslationJob['kind'], string> = {
  machine_pass: 'machine pass',
  preview: 'preview',
  crawl: 'crawl',
};

function JobStatusBadge({ status }: { status: TranslationJob['status'] }) {
  if (status === 'done') return <Badge>Done</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Failed</Badge>;
  if (status === 'running')
    return (
      <Badge variant="outline" className="gap-1 border-primary/50 text-primary">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Queued
    </Badge>
  );
}

function jobStatsLine(job: TranslationJob): string {
  const s = job.stats ?? {};
  if (job.kind === 'crawl') {
    if (job.status === 'queued') return 'waiting for the crawler';
    const parts = [
      `${s.pages ?? 0} pages`,
      `${s.strings ?? 0} strings`,
      `${s.newKeys ?? 0} new keys`,
    ];
    if ((s.errors ?? 0) > 0) parts.push(`${s.errors} page errors`);
    return parts.join(' · ');
  }
  // machine_pass / preview — worker fills the final stats; until then
  // show the upfront estimate (the cost that was quoted at queue time).
  if (s.translated !== undefined || s.fromTm !== undefined) {
    return `${s.translated ?? 0} translated · ${s.fromTm ?? 0} from TM · ${s.rejectedByGate ?? 0} gate-rejected · ${s.words ?? 0} words used`;
  }
  return `~${s.estimatedKeys ?? 0} keys · ~${s.estimatedWords ?? 0} words estimated`;
}

function JobsCard({
  projectId,
  refreshToken,
  onSettled,
}: {
  projectId: string;
  /** Bump to force a refetch (e.g. right after queueing a job). */
  refreshToken: number;
  /** Fired once when the last active job leaves queued/running. */
  onSettled: () => void;
}) {
  const [jobs, setJobs] = useState<TranslationJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await apiRequest<TranslationJob[]>(`/projects/${projectId}/jobs`);
      setJobs(data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load jobs"));
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const hasActive = (jobs ?? []).some((j) => j.status === 'queued' || j.status === 'running');

  // Settlement edge: active → idle means results just landed.
  const prevActive = useRef(false);
  useEffect(() => {
    if (prevActive.current && !hasActive) onSettled();
    prevActive.current = hasActive;
  }, [hasActive, onSettled]);

  // Poll every 5s ONLY while something is queued/running, and pause
  // while the tab is hidden.
  useEffect(() => {
    if (!hasActive) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null) timer = setInterval(() => void load(), 5000);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else start();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [hasActive, load]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="h-4 w-4 text-muted-foreground" /> Jobs
          {hasActive ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
        </CardTitle>
        <CardDescription>
          Machine passes and crawls. Word usage bills from the agent wallet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : jobs === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No jobs yet. Queue a machine pass from a locale row above — you&apos;ll see the word
            estimate before anything runs.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex flex-wrap items-center gap-2 border-b border-border py-2 last:border-0"
              >
                <Badge variant="secondary">{JOB_KIND_LABEL[job.kind]}</Badge>
                {job.locale ? <code className="font-mono text-xs">{job.locale}</code> : null}
                <JobStatusBadge status={job.status} />
                <span className="text-xs text-muted-foreground">{jobStatsLine(job)}</span>
                <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(job.createdAt, true)}
                </span>
                {job.status === 'failed' && job.error ? (
                  <p className="w-full text-xs text-destructive">{job.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Site card (Mode B only) ───────────────────────────────────────────

function SitePageStatusBadge({ status }: { status: SitePage['status'] }) {
  if (status === 'crawled') return <Badge variant="secondary">crawled</Badge>;
  if (status === 'error') return <Badge variant="destructive">error</Badge>;
  return (
    <Badge variant="outline" className="text-muted-foreground">
      discovered
    </Badge>
  );
}

function SiteCard({
  project,
  refreshToken,
  onQueued,
}: {
  project: ProjectDetail;
  /** Bump to refetch pages (e.g. after a crawl job settles). */
  refreshToken: number;
  /** Fired after a crawl is accepted so the jobs card refreshes. */
  onQueued: () => void;
}) {
  const [pages, setPages] = useState<SitePage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crawling, setCrawling] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiRequest<SitePage[]>(`/projects/${project.id}/pages`);
      setPages(data);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Couldn't load pages"));
    }
  }, [project.id]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  async function crawl() {
    setCrawling(true);
    const job = await queueCrawl(project.id, project.siteUrl ?? '');
    if (job) onQueued();
    setCrawling(false);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe2 className="h-4 w-4 text-muted-foreground" /> Site
            </CardTitle>
            <CardDescription className="truncate">{project.siteUrl}</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void crawl()} disabled={crawling}>
            {crawling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            Crawl site
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : pages === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : pages.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            No pages discovered yet. Run the first crawl — it walks same-origin links from the site
            URL and extracts visible strings.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Keys</TableHead>
                  <TableHead>Last crawled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-72">
                      <code className="break-all font-mono text-xs">{p.path}</code>
                      {p.status === 'error' && p.lastError ? (
                        <p className="mt-0.5 text-xs text-destructive">{p.lastError}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <SitePageStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-sm">{p.keyCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {p.lastCrawledAt ? formatDate(p.lastCrawledAt, true) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────

export default function ProjectHomePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiRequest<ProjectDetail>(`/projects/${id}`);
      setProject(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const [jobsRefresh, setJobsRefresh] = useState(0);
  const [pagesRefresh, setPagesRefresh] = useState(0);
  const [queueingLocale, setQueueingLocale] = useState<string | null>(null);

  // Quiet refetch (no skeleton) — completion bars move when jobs land.
  const refreshSilently = useCallback(async () => {
    try {
      const { data } = await apiRequest<ProjectDetail>(`/projects/${id}`);
      setProject(data);
    } catch {
      /* keep the stale view; the next manual action re-surfaces errors */
    }
  }, [id]);

  const onJobsSettled = useCallback(() => {
    void refreshSilently();
    setPagesRefresh((n) => n + 1);
  }, [refreshSilently]);

  async function machineTranslate(tag: string) {
    if (!project) return;
    setQueueingLocale(tag);
    const job = await queueMachinePass(project.id, tag);
    if (job) setJobsRefresh((n) => n + 1);
    setQueueingLocale(null);
  }

  async function toggleLocale(tag: string, enabled: boolean) {
    if (!project) return;
    const prev = project;
    setProject({
      ...project,
      locales: project.locales.map((l) => (l.tag === tag ? { ...l, enabled } : l)),
    });
    try {
      await apiRequest(`/projects/${project.id}/locales/${encodeURIComponent(tag)}`, {
        method: 'PATCH',
        body: { enabled },
      });
      toast.success(`Locale "${tag}" ${enabled ? 'enabled' : 'disabled'}`);
    } catch (e) {
      setProject(prev);
      toast.error(errorMessage(e, `Couldn't update locale "${tag}"`));
    }
  }

  async function setNamespacePolicy(name: string, reviewPolicy: ReviewPolicy) {
    if (!project) return;
    const prev = project;
    setProject({
      ...project,
      namespaces: project.namespaces.map((n) => (n.name === name ? { ...n, reviewPolicy } : n)),
    });
    try {
      await apiRequest(`/projects/${project.id}/namespaces/${encodeURIComponent(name)}`, {
        method: 'PATCH',
        body: { reviewPolicy },
      });
      toast.success(`Namespace "${name}" is now ${reviewPolicy}`);
    } catch (e) {
      setProject(prev);
      toast.error(errorMessage(e, `Couldn't update namespace "${name}"`));
    }
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <ErrorPanel
          title="Couldn't load project"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void load()}
        />
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
        <Skeleton className="h-56 w-full" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title={project.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs">{project.slug}</code>
            {project.mode === 'proxy' ? (
              <Badge variant="outline" className="gap-1">
                <Globe2 className="h-3 w-3" /> Proxy
              </Badge>
            ) : (
              <Badge variant="secondary">SDK</Badge>
            )}
            <span>
              source <code className="font-mono text-xs">{project.sourceLocale}</code>
            </span>
            {project.siteUrl ? <span className="truncate">{project.siteUrl}</span> : null}
          </span>
        }
        actions={
          <>
            <Button asChild>
              <Link href={`/dashboard/projects/${project.id}/workbench`}>
                <SquarePen className="h-4 w-4" /> Workbench
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/dashboard/projects/${project.id}/review`}>
                <ClipboardCheck className="h-4 w-4" /> Review
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/dashboard/projects/${project.id}/releases`}>
                <Rocket className="h-4 w-4" /> Releases
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        {/* Locales */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Target locales</CardTitle>
                <CardDescription>
                  The languages this project ships. The source locale is implicit.
                </CardDescription>
              </div>
              <AddLocaleDialog
                projectId={project.id}
                onAdded={(l) =>
                  setProject((p) => (p ? { ...p, locales: [...p.locales, l] } : p))
                }
              />
            </div>
          </CardHeader>
          <CardContent>
            {project.locales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No target locales yet. Add the first language you want to ship — translation starts
                there.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Locale</TableHead>
                      <TableHead>Fallback</TableHead>
                      <TableHead className="min-w-[240px]">Completion</TableHead>
                      <TableHead className="text-right">Enabled</TableHead>
                      <TableHead className="w-44" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.locales.map((l) => (
                      <TableRow key={l.tag}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <code className="font-mono text-sm">{l.tag}</code>
                            {l.rtl ? <Badge variant="outline">RTL</Badge> : null}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {l.fallback ?? `${project.sourceLocale} (source)`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <CompletionBar
                              approved={l.approved}
                              needsReview={l.needsReview}
                              machine={l.machine}
                              keyCount={l.keyCount}
                              className="w-32 shrink-0 sm:w-40"
                            />
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {l.approved} approved · {l.needsReview} review · {l.machine} machine ·{' '}
                              {l.missing} missing
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Switch
                            checked={l.enabled}
                            onCheckedChange={(v) => void toggleLocale(l.tag, v)}
                            aria-label={`Toggle ${l.tag}`}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={queueingLocale !== null || l.keyCount === 0}
                            title={
                              l.keyCount === 0
                                ? 'No keys to translate yet'
                                : `Queue an agent pass over "${l.tag}" — the word estimate is shown before it runs`
                            }
                            onClick={() => void machineTranslate(l.tag)}
                          >
                            {queueingLocale === l.tag ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Bot className="h-4 w-4" />
                            )}
                            Machine translate
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Namespaces */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Namespaces</CardTitle>
                  <CardDescription>Group keys and set their review policy.</CardDescription>
                </div>
                <AddNamespaceDialog
                  projectId={project.id}
                  onAdded={(ns) =>
                    setProject((p) => (p ? { ...p, namespaces: [...p.namespaces, ns] } : p))
                  }
                />
              </div>
            </CardHeader>
            <CardContent>
              {project.namespaces.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No namespaces yet — <code className="font-mono text-xs">extract</code> creates
                  them as it finds keys.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Review policy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {project.namespaces.map((ns) => (
                      <TableRow key={ns.id}>
                        <TableCell className="font-mono text-sm">{ns.name}</TableCell>
                        <TableCell className="text-right">
                          <Select
                            value={ns.reviewPolicy}
                            onValueChange={(v) =>
                              void setNamespacePolicy(ns.name, v as ReviewPolicy)
                            }
                          >
                            <SelectTrigger className="ml-auto w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="standard">standard</SelectItem>
                              <SelectItem value="gated">gated</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Last release */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Rocket className="h-4 w-4 text-muted-foreground" /> Last release
              </CardTitle>
              <CardDescription>The most recent published catalog.</CardDescription>
            </CardHeader>
            <CardContent>
              {project.lastRelease ? (
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">
                      {project.lastRelease.locale}
                    </Badge>
                    <span className="text-muted-foreground">
                      {project.lastRelease.keyCount} keys
                    </span>
                  </div>
                  <p className="text-muted-foreground">
                    Published {formatDate(project.lastRelease.createdAt, true)}
                  </p>
                  <Button asChild variant="link" className="h-auto p-0">
                    <Link href={`/dashboard/projects/${project.id}/releases`}>
                      View all releases
                    </Link>
                  </Button>
                </div>
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  Nothing published yet. Translate, review, then publish a locale from the Releases
                  page.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {project.mode === 'proxy' && project.siteUrl ? (
          <SiteCard
            project={project}
            refreshToken={pagesRefresh}
            onQueued={() => setJobsRefresh((n) => n + 1)}
          />
        ) : null}

        <JobsCard projectId={project.id} refreshToken={jobsRefresh} onSettled={onJobsSettled} />

        <CheckCard projectId={project.id} />
      </div>
    </div>
  );
}

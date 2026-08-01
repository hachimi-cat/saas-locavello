'use client';

/*
 * /dashboard — Projects overview. Cards per project with per-locale
 * completion bars, plus the "New project" dialog.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Globe2, Languages, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ErrorPanel } from '@/components/ui/error-panel';
import { CompletionBar, completionCaption } from '@/components/locavello/completion-bar';
import { PageHeader } from '@/components/locavello/page-header';
import { errorCode, errorMessage } from '@/components/locavello/format';
import type { LocaleStat, Project, ProjectMode } from '@/components/locavello/types';

function ModeBadge({ mode }: { mode: ProjectMode }) {
  return mode === 'proxy' ? (
    <Badge variant="outline" className="gap-1">
      <Globe2 className="h-3 w-3" /> Proxy
    </Badge>
  ) : (
    <Badge variant="secondary">SDK</Badge>
  );
}

function NewProjectDialog({ onCreated }: { onCreated: (p: Project) => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [sourceLocale, setSourceLocale] = useState('en');
  const [mode, setMode] = useState<ProjectMode>('sdk');
  const [siteUrl, setSiteUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setInlineError(null);
    try {
      const { data } = await apiRequest<Project>('/projects', {
        method: 'POST',
        body: {
          slug: slug.trim(),
          name: name.trim(),
          sourceLocale: sourceLocale.trim() || 'en',
          mode,
          ...(mode === 'proxy' ? { siteUrl: siteUrl.trim() } : {}),
        },
      });
      toast.success(`Project "${data.name}" created`);
      setOpen(false);
      setSlug('');
      setName('');
      setSourceLocale('en');
      setMode('sdk');
      setSiteUrl('');
      onCreated(data);
    } catch (e) {
      setInlineError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> New project
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            SDK projects pull committed catalogs in CI. Proxy projects crawl a URL and serve the
            translated site.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="np-name">Name</Label>
            <Input
              id="np-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My App"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="np-slug">Slug</Label>
            <Input
              id="np-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="my-app"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Lowercase letters, digits, hyphens.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label htmlFor="np-source">Source locale</Label>
              <Input
                id="np-source"
                value={sourceLocale}
                onChange={(e) => setSourceLocale(e.target.value)}
                placeholder="en"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as ProjectMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sdk">SDK — catalogs in your repo</SelectItem>
                  <SelectItem value="proxy">Proxy — translate a live site</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {mode === 'proxy' ? (
            <div className="grid gap-2">
              <Label htmlFor="np-site">Site URL</Label>
              <Input
                id="np-site"
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          ) : null}
          {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={submitting || !slug.trim() || !name.trim() || (mode === 'proxy' && !siteUrl.trim())}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectCard({ project, locales }: { project: Project; locales: LocaleStat[] | undefined }) {
  const shown = locales?.slice(0, 4) ?? [];
  const extra = (locales?.length ?? 0) - shown.length;
  return (
    <Link href={`/dashboard/projects/${project.id}`} className="block">
      <Card className="h-full transition-colors hover:border-primary/50">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">{project.name}</CardTitle>
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{project.slug}</p>
            </div>
            <ModeBadge mode={project.mode} />
          </div>
        </CardHeader>
        <CardContent>
          {locales === undefined ? (
            <div className="space-y-2">
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-3/4" />
            </div>
          ) : locales.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No target locales yet — add one from the project page.
            </p>
          ) : (
            <div className="space-y-2.5">
              {shown.map((l) => (
                <div key={l.tag} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                    {l.tag}
                  </span>
                  <CompletionBar
                    approved={l.approved}
                    needsReview={l.needsReview}
                    machine={l.machine}
                    keyCount={l.keyCount}
                    className="flex-1"
                  />
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {completionCaption(l.approved, l.keyCount)}
                  </span>
                </div>
              ))}
              {extra > 0 ? (
                <p className="text-xs text-muted-foreground">+{extra} more locales</p>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ProjectsOverviewPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [statsById, setStatsById] = useState<Record<string, LocaleStat[]>>({});
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiRequest<Project[]>('/projects?limit=100');
      setProjects(data);
      // Per-locale completion isn't on the list payload — fan out to
      // GET /projects/:id/locales (best-effort; bars skeleton until then).
      const results = await Promise.allSettled(
        data.map((p) => apiRequest<LocaleStat[]>(`/projects/${p.id}/locales`)),
      );
      const map: Record<string, LocaleStat[]> = {};
      results.forEach((r, i) => {
        map[data[i].id] = r.status === 'fulfilled' ? r.value.data : [];
      });
      setStatsById(map);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Projects"
        description="Extract strings, translate, review, and ship every locale."
        actions={
          <NewProjectDialog
            onCreated={(p) => router.push(`/dashboard/projects/${p.id}`)}
          />
        }
      />

      {error ? (
        <ErrorPanel
          title="Couldn't load projects"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void load()}
        />
      ) : loading && !projects ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-2 h-3 w-24" />
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-2 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : projects && projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Languages className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Create your first project</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                A project holds your keys, target locales, and releases. Wrap strings with{' '}
                <code className="font-mono text-xs">t()</code> and push them with the CLI, or point
                the proxy at a live site.
              </p>
            </div>
            <NewProjectDialog onCreated={(p) => router.push(`/dashboard/projects/${p.id}`)} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects?.map((p) => (
            <ProjectCard key={p.id} project={p} locales={statsById[p.id]} />
          ))}
        </div>
      )}
    </div>
  );
}

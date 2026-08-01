'use client';

/*
 * /dashboard/glossary — account-wide + per-project terms. A term with a
 * locale + translation forces that translation; a term with neither is
 * do-not-translate (brand names, product names).
 */

import { useCallback, useEffect, useState } from 'react';
import { BookMarked, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ErrorPanel } from '@/components/ui/error-panel';
import { PageHeader } from '@/components/locavello/page-header';
import { errorCode, errorMessage } from '@/components/locavello/format';
import type { GlossaryTerm, Project } from '@/components/locavello/types';

const ACCOUNT_SCOPE = 'account';

function AddTermDialog({
  projects,
  onAdded,
}: {
  projects: Project[];
  onAdded: (term: GlossaryTerm) => void;
}) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<string>(ACCOUNT_SCOPE);
  const [locale, setLocale] = useState('');
  const [translation, setTranslation] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const needsLocale = translation.trim() !== '' && locale.trim() === '';

  async function submit() {
    if (needsLocale) {
      setInlineError('A forced translation needs a locale.');
      return;
    }
    setSubmitting(true);
    setInlineError(null);
    try {
      const { data } = await apiRequest<GlossaryTerm>('/glossary', {
        method: 'POST',
        body: {
          term: term.trim(),
          projectId: scope === ACCOUNT_SCOPE ? null : scope,
          locale: locale.trim() === '' ? null : locale.trim(),
          translation: translation.trim() === '' ? null : translation.trim(),
          note: note.trim() === '' ? null : note.trim(),
        },
      });
      toast.success(`Glossary term "${data.term}" added`);
      onAdded(data);
      setOpen(false);
      setTerm('');
      setScope(ACCOUNT_SCOPE);
      setLocale('');
      setTranslation('');
      setNote('');
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
          <Plus className="h-4 w-4" /> Add term
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add glossary term</DialogTitle>
          <DialogDescription>
            Leave translation empty to mark the term do-not-translate; set locale + translation to
            force a specific rendering.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="gt-term">Term</Label>
            <Input
              id="gt-term"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Locavello"
            />
          </div>
          <div className="grid gap-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ACCOUNT_SCOPE}>Account-wide (every project)</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
            <div className="grid gap-2">
              <Label htmlFor="gt-locale">Locale (optional)</Label>
              <Input
                id="gt-locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="id"
                className="font-mono"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gt-translation">Forced translation</Label>
              <Input
                id="gt-translation"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                placeholder="leave empty = do not translate"
              />
            </div>
          </div>
          {needsLocale ? (
            <p className="text-sm text-destructive">A forced translation needs a locale.</p>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="gt-note">Note (optional)</Label>
            <Textarea
              id="gt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Why this term matters, e.g. registered trademark."
            />
          </div>
          {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !term.trim() || needsLocale}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add term
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GlossaryPage() {
  const [terms, setTerms] = useState<GlossaryTerm[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [g, p] = await Promise.all([
        apiRequest<GlossaryTerm[]>('/glossary'),
        apiRequest<Project[]>('/projects?limit=100'),
      ]);
      setTerms(g.data);
      setProjects(p.data);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const projectName = (id: string | null) =>
    id === null ? null : (projects.find((p) => p.id === id)?.name ?? id);

  async function remove(term: GlossaryTerm) {
    setDeletingId(term.id);
    try {
      await apiRequest(`/glossary/${term.id}`, { method: 'DELETE' });
      setTerms((prev) => (prev ?? []).filter((t) => t.id !== term.id));
      toast.success(`Deleted "${term.term}"`);
    } catch (e) {
      toast.error(errorMessage(e, `Couldn't delete "${term.term}"`));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Glossary"
        description="Terms the translator — human or agent — must respect in every pass."
        actions={<AddTermDialog projects={projects} onAdded={(t) => setTerms((prev) => [...(prev ?? []), t].sort((a, b) => a.term.localeCompare(b.term)))} />}
      />

      {error ? (
        <ErrorPanel
          title="Couldn't load the glossary"
          message={errorMessage(error)}
          code={errorCode(error)}
          onRetry={() => void load()}
        />
      ) : terms === null ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : terms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <BookMarked className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">No glossary terms yet</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Start with your brand and product names as do-not-translate terms — the check report
                flags any translation that loses them.
              </p>
            </div>
            <AddTermDialog projects={projects} onAdded={(t) => setTerms((prev) => [...(prev ?? []), t])} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Term</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Locale</TableHead>
                    <TableHead>Translation</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {terms.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.term}</TableCell>
                      <TableCell>
                        {t.projectId === null ? (
                          <Badge variant="secondary">Account-wide</Badge>
                        ) : (
                          <Badge variant="outline">{projectName(t.projectId)}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.locale ?? 'all'}
                      </TableCell>
                      <TableCell>
                        {t.translation ?? (
                          <Badge variant="outline" className="text-muted-foreground">
                            do not translate
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                        {t.note ?? '—'}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={deletingId === t.id}
                              aria-label={`Delete ${t.term}`}
                            >
                              {deletingId === t.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete “{t.term}”?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Future checks and machine passes stop enforcing this term. Existing
                                translations aren&apos;t touched.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => void remove(t)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
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

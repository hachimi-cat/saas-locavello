'use client';

/*
 * /dashboard/developers — API keys (mint / list / revoke) and the CLI
 * quickstart. The key plaintext is shown exactly once, at mint time.
 */

import { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, Loader2, Plus, TerminalSquare, TriangleAlert } from 'lucide-react';
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
import { errorCode, errorMessage, formatDate } from '@/components/locavello/format';
import type { ApiKeyRow, MintedApiKey } from '@/components/locavello/types';

async function copyToClipboard(text: string, what = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy — select and copy manually");
  }
}

function MintKeyDialog({ onMinted }: { onMinted: (row: ApiKeyRow) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [minted, setMinted] = useState<MintedApiKey | null>(null);

  async function submit() {
    setSubmitting(true);
    setInlineError(null);
    try {
      const { data } = await apiRequest<MintedApiKey>('/api-keys', {
        method: 'POST',
        body: { name: name.trim() },
      });
      setMinted(data);
      const { plaintext: _pt, ...row } = data;
      onMinted(row);
    } catch (e) {
      setInlineError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setOpen(false);
    setName('');
    setMinted(null);
    setInlineError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setOpen(true);
        else if (!submitting) close();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Mint API key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {minted === null ? (
          <>
            <DialogHeader>
              <DialogTitle>Mint API key</DialogTitle>
              <DialogDescription>
                For the CLI and CI. Sent as{' '}
                <code className="font-mono text-xs">Authorization: Bearer lv_live_…</code>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-2">
              <Label htmlFor="ak-name">Name</Label>
              <Input
                id="ak-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ci-production"
              />
              {inlineError ? <p className="text-sm text-destructive">{inlineError}</p> : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={submitting || !name.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Mint key
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>“{minted.name}” minted</DialogTitle>
              <DialogDescription>Copy the key now and store it somewhere safe.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
                <code className="min-w-0 flex-1 break-all font-mono text-sm">
                  {minted.plaintext}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void copyToClipboard(minted.plaintext, 'API key copied')}
                  aria-label="Copy API key"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                You won&apos;t see this key again — only a hash is stored.
              </p>
            </div>
            <DialogFooter>
              <Button onClick={close}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

const CLI_STEPS: Array<{ comment: string; command: string }> = [
  { comment: '# install', command: 'npm i -g @forjio/locavello-cli' },
  {
    comment: '# wire this project into your repo',
    command: 'locavello init --project <id> --api-url https://locavello.forjio.com',
  },
  {
    comment: '# pull the latest released catalogs (CI)',
    command: 'LOCAVELLO_API_KEY=… locavello pull',
  },
];

export default function DevelopersPage() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data } = await apiRequest<ApiKeyRow[]>('/api-keys');
      setKeys(data);
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(row: ApiKeyRow) {
    setRevokingId(row.id);
    try {
      const { data } = await apiRequest<{ id: string; revokedAt: string }>(`/api-keys/${row.id}`, {
        method: 'DELETE',
      });
      setKeys((prev) =>
        (prev ?? []).map((k) => (k.id === row.id ? { ...k, revokedAt: data.revokedAt } : k)),
      );
      toast.success(`Revoked "${row.name}"`);
    } catch (e) {
      toast.error(errorMessage(e, `Couldn't revoke "${row.name}"`));
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Developers"
        description="API keys for the CLI, SDK, and CI — plus how to wire them up."
        actions={
          <MintKeyDialog onMinted={(row) => setKeys((prev) => [row, ...(prev ?? [])])} />
        }
      />

      <div className="space-y-6">
        {error ? (
          <ErrorPanel
            title="Couldn't load API keys"
            message={errorMessage(error)}
            code={errorCode(error)}
            onRetry={() => void load()}
          />
        ) : keys === null ? (
          <Card>
            <CardContent className="space-y-3 p-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : keys.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <KeyRound className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">No API keys yet</h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Mint one to let <code className="font-mono text-xs">locavello pull</code> fetch
                  catalogs in CI. Keys are account-scoped and revocable any time.
                </p>
              </div>
              <MintKeyDialog onMinted={(row) => setKeys((prev) => [row, ...(prev ?? [])])} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last used</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-24 text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-medium">{k.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {k.prefix}…
                        </TableCell>
                        <TableCell>
                          {k.revokedAt ? (
                            <Badge variant="destructive">Revoked</Badge>
                          ) : (
                            <Badge variant="secondary">Active</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {k.lastUsedAt ? formatDate(k.lastUsedAt, true) : 'never'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(k.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          {k.revokedAt ? null : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-destructive"
                                  disabled={revokingId === k.id}
                                >
                                  {revokingId === k.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : null}
                                  Revoke
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Revoke “{k.name}”?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Anything still using{' '}
                                    <code className="font-mono text-xs">{k.prefix}…</code> — CI
                                    pulls included — starts failing immediately. This can&apos;t be
                                    undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => void revoke(k)}>
                                    Revoke key
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* CLI quickstart */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare className="h-4 w-4 text-muted-foreground" /> CLI quickstart
            </CardTitle>
            <CardDescription>
              Mode A in three commands — catalogs live in your repo, Locavello never becomes a
              runtime dependency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-4">
              {CLI_STEPS.map((step) => (
                <div key={step.command}>
                  <p className="font-mono text-xs text-muted-foreground">{step.comment}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <code className="min-w-0 flex-1 break-all font-mono text-sm">
                      {step.command}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => void copyToClipboard(step.command, 'Command copied')}
                      aria-label={`Copy: ${step.command}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

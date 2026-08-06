'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, Pencil, Plus, User } from 'lucide-react';
import { toast } from 'sonner';
import { readActiveWorkspaceId, writeActiveWorkspace } from '@forjio/portal-ui';
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
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/locavello/page-header';
import { api, ApiRequestError } from '@/lib/api';

/*
 * /dashboard/workspaces — the Huudis workspaces you belong to, plus
 * your personal workspace. Fully self-serve via the Huudis proxy
 * (backend/src/routes/huudis-proxy.ts):
 *
 *   GET   /huudis/account/workspaces             — list
 *   POST  /huudis/account/workspaces             — create { name }
 *   PATCH /huudis/account/workspaces/:id         — rename { name }
 *   POST  /huudis/account/workspaces/:id/switch  — Huudis-side active
 *
 * Switching also writes the family `locavello_active_workspace` cookie
 * (@forjio/portal-ui writeActiveWorkspace) — the locavello backend scopes
 * every CI request to it — then reloads into /dashboard.
 */

const BRAND_SLUG = 'locavello';

interface Workspace {
  id: string;
  name: string;
  slug?: string | null;
  role: string;
  isForjioInternal?: boolean;
  pendingDeletionAt?: string | null;
}

function errMessage(err: unknown): string {
  return err instanceof ApiRequestError || err instanceof Error
    ? err.message
    : 'Something went wrong';
}

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Workspace[]>('/huudis/account/workspaces');
      setWorkspaces(Array.isArray(data) ? data : []);
      setLoadError(null);
    } catch (err) {
      setWorkspaces([]);
      setLoadError(errMessage(err));
    }
    try {
      // /auth/me exposes the product session — `user.id` is the derived
      // personal workspace id the backend scopes to by default.
      const { data } = await api.get<{ user?: { id?: string; name?: string } }>('/auth/me');
      setPersonalId(data?.user?.id ?? null);
      setUserName(data?.user?.name ?? null);
    } catch {
      /* non-fatal */
    }
    setActiveId(readActiveWorkspaceId('cookie', BRAND_SLUG) ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The cookie only counts as active when it names a workspace we can
  // actually see; otherwise the personal workspace is active.
  const knownIds = new Set([...(workspaces ?? []).map((w) => w.id), personalId].filter(Boolean));
  const effectiveActive = activeId && knownIds.has(activeId) ? activeId : personalId;

  async function switchTo(id: string, isHuudisWorkspace: boolean) {
    if (switchingId) return;
    setSwitchingId(id);
    try {
      if (isHuudisWorkspace) {
        // Keep the Huudis session's active workspace in sync (best
        // effort — the locavello cookie below is what scopes localization data).
        await api.post(`/huudis/account/workspaces/${id}/switch`).catch(() => null);
      }
      writeActiveWorkspace('cookie', BRAND_SLUG, id);
      // The backend resolves the cookie per request — reload so every
      // page reflects the newly-active workspace.
      window.location.href = '/dashboard';
    } catch (err) {
      toast.error('Could not switch workspace', { description: errMessage(err) });
      setSwitchingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Workspaces"
        description="Each workspace has its own projects, translations, usage, and billing. Workspaces live in Huudis and work across the whole Forjio family."
        actions={<CreateWorkspaceDialog onCreated={load} />}
      />

      {loadError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          Could not load your team workspaces: {loadError}
        </div>
      )}

      {workspaces === null ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {personalId && (
                <WorkspaceRow
                  icon={<User className="h-5 w-5 text-primary" />}
                  name={userName ? `${userName}'s workspace` : 'Personal workspace'}
                  sub="Your private workspace — not shared with a team"
                  role="owner"
                  active={effectiveActive === personalId}
                  switching={switchingId === personalId}
                  disabled={switchingId !== null}
                  onSwitch={() => switchTo(personalId, false)}
                />
              )}
              {workspaces.map((w) => (
                <WorkspaceRow
                  key={w.id}
                  icon={<Building2 className="h-5 w-5 text-primary" />}
                  name={w.name}
                  sub={w.slug ?? w.id}
                  role={w.role}
                  active={effectiveActive === w.id}
                  switching={switchingId === w.id}
                  disabled={switchingId !== null}
                  pendingDeletionAt={w.pendingDeletionAt}
                  onSwitch={() => switchTo(w.id, true)}
                  renameSlot={
                    (w.role === 'owner' || w.role === 'admin') && (
                      <RenameWorkspaceDialog workspace={w} onRenamed={load} />
                    )
                  }
                />
              ))}
              {workspaces.length === 0 && !personalId && (
                <div className="py-14 text-center text-sm text-muted-foreground">
                  No workspaces found.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Members and roles are managed in{' '}
        <a
          href="https://huudis.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Huudis
        </a>
        . A workspace created here is immediately usable in every Forjio product.
      </p>
    </div>
  );
}

function WorkspaceRow({
  icon,
  name,
  sub,
  role,
  active,
  switching,
  disabled,
  pendingDeletionAt,
  onSwitch,
  renameSlot,
}: {
  icon: React.ReactNode;
  name: string;
  sub: string;
  role: string;
  active: boolean;
  switching: boolean;
  disabled: boolean;
  pendingDeletionAt?: string | null;
  onSwitch: () => void;
  renameSlot?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{name}</span>
          {pendingDeletionAt && (
            <Badge variant="destructive" className="shrink-0 text-[10px]">
              deletion scheduled
            </Badge>
          )}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">{sub}</p>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
        {role}
      </Badge>
      {renameSlot}
      {active ? (
        <Badge className="shrink-0">Active</Badge>
      ) : (
        <Button variant="outline" size="sm" onClick={onSwitch} disabled={disabled}>
          {switching && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Switch
        </Button>
      )}
    </div>
  );
}

/* ── Create ──────────────────────────────────────────────────────── */

function CreateWorkspaceDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post<Workspace>('/huudis/account/workspaces', {
        name: name.trim(),
      });
      setOpen(false);
      setName('');
      toast.success(`Workspace "${data?.name ?? name.trim()}" created`, {
        description: 'Switch to it to start adding projects.',
      });
      onCreated();
    } catch (err) {
      toast.error('Could not create workspace', { description: errMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        if (!o) setName('');
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          New workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>
            A shared space for a team&apos;s projects and translations. You become its owner and
            can invite members in Huudis.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ws-name">Workspace name</Label>
            <Input
              id="ws-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Engineering"
              maxLength={120}
              required
              disabled={busy}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Create workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Rename ──────────────────────────────────────────────────────── */

function RenameWorkspaceDialog({
  workspace,
  onRenamed,
}: {
  workspace: Workspace;
  onRenamed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(workspace.name);
  const [busy, setBusy] = useState(false);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim() || name.trim() === workspace.name) return;
    setBusy(true);
    try {
      await api.patch(`/huudis/account/workspaces/${workspace.id}`, { name: name.trim() });
      setOpen(false);
      toast.success('Workspace renamed');
      onRenamed();
    } catch (err) {
      toast.error('Could not rename workspace', { description: errMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (busy) return;
        setOpen(o);
        setName(workspace.name);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Rename ${workspace.name}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename workspace</DialogTitle>
          <DialogDescription>
            The new name applies across every Forjio product. The workspace ID and slug do not
            change.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={rename} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`rename-${workspace.id}`}>Workspace name</Label>
            <Input
              id={`rename-${workspace.id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              disabled={busy}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim() || name.trim() === workspace.name}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

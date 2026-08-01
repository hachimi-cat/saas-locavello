'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Loader2,
  LogOut,
  Save,
  ShieldCheck,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { api, ApiRequestError } from '@/lib/api';

/*
 * /dashboard/settings — forjio-standard account settings (the pawpado
 * shape): editable profile, password + session security, and a danger
 * zone. Identity lives in Huudis; every mutation rides the
 * /api/v1/huudis proxy (backend/src/routes/huudis-proxy.ts):
 *
 *   PATCH /huudis/account                      — display name
 *   POST  /huudis/account/password-change      — password
 *   POST  /huudis/account/sessions/revoke-all  — sign out everywhere
 *   POST  /huudis/account/schedule-deletion    — delete (30-day grace)
 *   POST  /huudis/account/cancel-deletion      — undo scheduled delete
 */

interface HuudisAccount {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  hasPassword: boolean;
  mfaEnabled: boolean;
  pendingDeletionAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

function errMessage(err: unknown): string {
  return err instanceof ApiRequestError || err instanceof Error
    ? err.message
    : 'Something went wrong';
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function SettingsPage() {
  const [account, setAccount] = useState<HuudisAccount | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<HuudisAccount>('/huudis/account');
      setAccount(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(errMessage(err));
    } finally {
      setLoading(false);
    }
    // The workspace id the localization data is scoped to — from the product
    // session, not Huudis.
    try {
      const { data } = await api.get<{ user?: { id?: string } }>('/auth/me');
      setWorkspaceId(data?.user?.id ?? null);
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Your profile and security, synced with your Huudis identity across every Forjio
          product.
        </p>
      </header>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : loadError ? (
        <Card className="border-destructive/40">
          <CardContent className="py-8 text-center text-sm">
            <p className="font-medium text-destructive">Could not load your account</p>
            <p className="mt-1 text-muted-foreground">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => { setLoading(true); load(); }}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : account ? (
        <>
          {account.pendingDeletionAt && <PendingDeletionBanner account={account} onChanged={load} />}
          <ProfileCard account={account} workspaceId={workspaceId} onSaved={load} />
          <SecurityCard account={account} />
          {!account.pendingDeletionAt && <DangerZone account={account} onChanged={load} />}
        </>
      ) : null}
    </div>
  );
}

/* ── Profile ─────────────────────────────────────────────────────── */

function ProfileCard({
  account,
  workspaceId,
  onSaved,
}: {
  account: HuudisAccount;
  workspaceId: string | null;
  onSaved: () => void;
}) {
  const initial = account.name ?? '';
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = name.trim() !== initial.trim();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving || !dirty || !name.trim()) return;
    setSaving(true);
    try {
      await api.patch('/huudis/account', { name: name.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      toast.success('Profile updated');
      onSaved();
    } catch (err) {
      toast.error('Could not update profile', { description: errMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profile</CardTitle>
        <CardDescription>
          Your display name across every Forjio product. Email is managed in Huudis and
          can&apos;t be changed here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form onSubmit={save} className="max-w-md space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Display name</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={120}
              placeholder="Your name"
            />
          </div>
          <Button type="submit" size="sm" disabled={saving || !dirty || !name.trim()}>
            {saving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : saved ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            Save name
          </Button>
        </form>

        <div className="border-t border-border pt-1 text-sm">
          <Row
            label="Email"
            value={
              <span className="inline-flex items-center gap-2">
                {account.email}
                {account.emailVerified && (
                  <Badge variant="secondary" className="text-[10px]">
                    verified
                  </Badge>
                )}
              </span>
            }
          />
          <Row label="Huudis account" value={account.id} mono />
          <Row label="Workspace ID" value={workspaceId ?? '—'} mono />
          <Row label="Member since" value={fmtDate(account.createdAt)} />
          <Row label="Last sign-in" value={fmtDate(account.lastLoginAt)} />
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono text-xs' : undefined}>{value}</span>
    </div>
  );
}

/* ── Security ────────────────────────────────────────────────────── */

function SecurityCard({ account }: { account: HuudisAccount }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (next.length < 10) {
      toast.error('New password must be at least 10 characters.');
      return;
    }
    if (next !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/huudis/account/password-change', {
        currentPassword: current,
        newPassword: next,
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password updated', {
        description: 'The new password applies across every Forjio product.',
      });
    } catch (err) {
      toast.error('Could not change password', { description: errMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  async function revokeAll() {
    setRevoking(true);
    try {
      const { data } = await api.post<{ revokedCount?: number }>(
        '/huudis/account/sessions/revoke-all',
      );
      setRevokeOpen(false);
      toast.success('Signed out everywhere', {
        description: `${data?.revokedCount ?? 0} other session(s) revoked. This session stays active.`,
      });
    } catch (err) {
      toast.error('Could not revoke sessions', { description: errMessage(err) });
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Security</CardTitle>
        <CardDescription>
          Password and active sessions on your Huudis account.
          {account.mfaEnabled && ' Two-factor authentication is enabled.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {account.hasPassword ? (
          <form onSubmit={changePassword} className="max-w-md space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Current password</Label>
              <Input
                id="pw-current"
                type="password"
                required
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">At least 10 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={saving}
              />
            </div>
            <Button type="submit" size="sm" disabled={saving || !current || !next || !confirm}>
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
              )}
              Update password
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your account signs in via SSO / social login and has no password. Manage sign-in
            methods in{' '}
            <a
              href="https://huudis.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Huudis
            </a>
            .
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <div>
            <p className="text-sm font-medium">Sign out everywhere</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Revokes every other Huudis session — other devices and Forjio products. This
              session stays signed in.
            </p>
          </div>
          <AlertDialog open={revokeOpen} onOpenChange={setRevokeOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <LogOut className="mr-1.5 h-3.5 w-3.5" />
                Sign out everywhere
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out of all other sessions?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every other device signed in with your Huudis account — across all Forjio
                  products — will need to sign in again. Your current session is not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
                <Button onClick={revokeAll} disabled={revoking}>
                  {revoking && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Sign out everywhere
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Danger zone ─────────────────────────────────────────────────── */

function PendingDeletionBanner({
  account,
  onChanged,
}: {
  account: HuudisAccount;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api.post('/huudis/account/cancel-deletion');
      toast.success('Account deletion canceled');
      onChanged();
    } catch (err) {
      toast.error('Could not cancel deletion', { description: errMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="text-sm">
          <p className="font-medium">Account deletion scheduled</p>
          <p className="mt-0.5 text-muted-foreground">
            Your Huudis account will be permanently deleted on{' '}
            <span className="font-medium text-foreground">
              {fmtDate(account.pendingDeletionAt)}
            </span>
            . You can cancel any time before then.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={cancel} disabled={busy}>
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Undo2 className="mr-1.5 h-3.5 w-3.5" />
        )}
        Cancel deletion
      </Button>
    </div>
  );
}

function DangerZone({ account, onChanged }: { account: HuudisAccount; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const ready = confirmText === 'DELETE' && (!account.hasPassword || password.length > 0);

  async function scheduleDeletion() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await api.post<{ scheduled: boolean; pendingDeletionAt: string }>(
        '/huudis/account/schedule-deletion',
        account.hasPassword ? { password } : {},
      );
      setOpen(false);
      setConfirmText('');
      setPassword('');
      toast.success('Account deletion scheduled', {
        description: 'A 30-day grace period has started — you can cancel from this page.',
      });
      onChanged();
    } catch (err) {
      toast.error('Could not schedule deletion', { description: errMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        <CardDescription>Irreversible actions on your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="text-sm">
              <p className="font-medium">Delete account</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Schedules your Huudis account for deletion after a 30-day grace period. This is
                your identity for every Forjio product — Locavello projects, translations, and releases
                under your personal workspace become unreachable.
              </p>
            </div>
          </div>
          <AlertDialog
            open={open}
            onOpenChange={(o) => {
              if (busy) return;
              setOpen(o);
              if (!o) {
                setConfirmText('');
                setPassword('');
              }
            }}
          >
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete my account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <p>
                      This schedules your <span className="font-medium">Huudis account</span> —
                      your sign-in for every Forjio product — for permanent deletion after a
                      30-day grace period.
                    </p>
                    <p>
                      If you are the sole owner of any team workspace, transfer ownership or
                      delete it first — Huudis will refuse otherwise.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="del-confirm">
                    Type <span className="font-mono text-foreground">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="del-confirm"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="DELETE"
                    className="font-mono"
                    disabled={busy}
                  />
                </div>
                {account.hasPassword && (
                  <div className="space-y-1.5">
                    <Label htmlFor="del-password">Confirm with your password</Label>
                    <Input
                      id="del-password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <Button variant="destructive" onClick={scheduleDeletion} disabled={!ready || busy}>
                  {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Schedule deletion
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

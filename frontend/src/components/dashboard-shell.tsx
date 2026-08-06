'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Building2,
  CreditCard,
  BookOpen,
  DatabaseZap,
  FileText,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  Settings,
  Shield,
  Webhook,
} from 'lucide-react';
import {
  MobileHeader,
  Sidebar,
  readActiveWorkspaceId,
  type PortalWorkspace,
  type SessionUser,
  type NavSection,
} from '@forjio/portal-ui';
import { LocavelloMark } from '@/components/brand/logo';
import {
  useAssistantActivity,
  useCatentioCredits,
  useCatentioStatus,
} from '@/hooks/use-catentio';
import { CatentioDockedChat } from '@/components/catentio/docked-chat';

/*
 * Dashboard shell — the authenticated portal chrome. `@forjio/portal-ui`
 * Sidebar renders the workspace switcher, nav, and profile dropdown;
 * the host (this file) supplies the workspace list, active id, nav
 * sections, user, the mobile-drawer open state, and the logout handler.
 *
 * FORKERS: add your portal pages as `SECTIONS` entries below. Keep
 * "Overview → Dashboard" first. Workspace persistence is `cookie` —
 * the family canon; do not switch to localStorage.
 */

// rename.sh rewrites "Locavello" / "locavello". Brand color
// follows the theme's `--primary` token (set in app/globals.css) —
// the pawpado role-shell convention — so retuning the token rebrands
// the shell too; don't hardcode a hex here.
const BRAND = 'Locavello';
const BRAND_SLUG = 'locavello';
const BRAND_COLOR = 'hsl(var(--primary))';
const BRAND_COLOR_SOFT = 'hsl(var(--primary) / 0.15)';

// Hosted Suppuo support portal for this product's Suppuo workspace — the
// family helpdesk entry point (ticket history + live chat). Handle = brand
// slug (Suppuo resolves slug-or-acc); rename.sh rewrites `locavello`.
const SUPPORT_URL = 'https://suppuo.com/portal/locavello';

// Section shape mirrors the family gold standard (depllo/secronna):
// product sections first, then Developer, then Account with
// Workspace → Settings → Billing.
const SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Projects', icon: LayoutDashboard }],
  },
  {
    label: 'Localization',
    items: [
      { href: '/dashboard/glossary', label: 'Glossary', icon: BookMarked },
      { href: '/dashboard/tm', label: 'Translation memory', icon: DatabaseZap },
    ],
  },
  {
    label: 'Developer',
    items: [
      { href: '/dashboard/developers', label: 'API keys & CLI', icon: KeyRound },
      { href: '/dashboard/webhooks', label: 'Webhooks', icon: Webhook },
      { href: '/dashboard/audit', label: 'Audit log', icon: ScrollText },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/dashboard/workspaces', label: 'Workspace', icon: Building2 },
      { href: '/dashboard/settings', label: 'Settings', icon: Settings },
      { href: '/dashboard/billing', label: 'Billing', icon: CreditCard },
    ],
  },
];

// Profile-dropdown footer links (portal-ui Sidebar `dropdownLinks`).
// Support + docs + legal live here — in the profile dropdown — rather
// than as main-nav items (family standard, see suppuo's shell). The
// Sidebar opens absolute http(s) hrefs (Support) in a new tab. Do NOT
// move Support back into `SECTIONS`.
const DROPDOWN_LINKS = [
  { href: '/docs', label: 'Documentation', icon: BookOpen },
  { href: SUPPORT_URL, label: 'Support', icon: LifeBuoy },
  { href: '/terms', label: 'Terms of Service', icon: FileText },
  { href: '/privacy', label: 'Privacy Policy', icon: Shield },
];

async function logout() {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* clear client state regardless */
  }
  window.location.href = '/login';
}

export function DashboardShell({
  user,
  accountId,
  children,
}: {
  user: SessionUser;
  /** The user's own derived account id, from /auth/me. Used as the
   *  fallback workspace until a product wires a real workspace list. */
  accountId: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Embedded catentio assistant — flag-gated per user; flag off =
  // sidebar + column unchanged. The chip math is linksnap's
  // (credits-meter-must-read-plan-limit-not-ledger): fill = consumed
  // share of the LARGER of the monthly grant and everything the wallet
  // actually had this period, so a seeded/topped-up wallet never reads
  // "94% used" beside a four-figure balance.
  const { enabled: assistantEnabled } = useCatentioStatus();
  const { credits, refresh: refreshCredits } = useCatentioCredits(assistantEnabled);
  // A run that just finished has already been billed — the chip must
  // show it without a reload. Refresh immediately AND once more shortly
  // after, in case our read beat the meter's write.
  useAssistantActivity(() => {
    refreshCredits();
    const timer = setTimeout(refreshCredits, 2500);
    return () => clearTimeout(timer);
  });
  const chipCredits = useMemo(() => {
    if (!credits) return null;
    const balance = credits.balance.credits;
    const period = new Date().toISOString().slice(0, 7);
    const used =
      credits.balance.used_this_period_credits ??
      credits.ledger
        .filter(
          (r) =>
            r.kind === 'embedded_agent_usage' &&
            r.credits < 0 &&
            (r.at ?? '').slice(0, 7) === period,
        )
        .reduce((a, r) => a + -r.credits, 0);
    const grant = credits.balance.monthly_grant_credits ?? 0;
    const limit = Math.max(grant, Math.max(balance, 0) + used);
    const now = new Date();
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const date = reset.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const time = reset.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return {
      credits: balance,
      grantCredits: limit,
      usedFraction: limit > 0 ? Math.min(1, used / limit) : 0,
      caption: `Resets ${date}, ${time}`,
      href: '/dashboard/billing#credits',
    };
  }, [credits]);

  // The user always has at least their own account — so the switcher
  // shows a real name even before a product ships /account/workspaces.
  const fallback: PortalWorkspace = {
    id: accountId,
    name: user?.name ? `${user.name}'s workspace` : 'My workspace',
    role: 'owner',
  };
  const [workspaces, setWorkspaces] = useState<PortalWorkspace[]>([fallback]);
  const [activeId, setActiveId] = useState<string>(accountId);

  useEffect(() => {
    const cookieId = readActiveWorkspaceId('cookie', BRAND_SLUG);
    // Real Huudis workspace list via the backend's huudis-proxy — the
    // template's bare /account/workspaces 404s and strands the switcher
    // on the fallback personal workspace.
    fetch('/api/v1/huudis/account/workspaces', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        const list = (b?.data ?? []) as PortalWorkspace[];
        const ws = Array.isArray(list) && list.length ? list : [fallback];
        setWorkspaces(ws);
        setActiveId(cookieId && ws.some((w) => w.id === cookieId) ? cookieId : ws[0].id);
      })
      .catch(() => {
        if (cookieId) setActiveId(cookieId);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // h-dvh + overflow-hidden, NOT minHeight 100vh: the docked assistant
    // anchors to the content column, so the column has to be exactly
    // viewport height or the dock lands below the fold on any page taller
    // than the screen. Scrolling moves into <main>. linksnap is the
    // reference; storlaunch measured the bug (top 730 in a 720 viewport).
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        brandSlug={BRAND_SLUG}
        brandName={BRAND}
        brandColor={BRAND_COLOR}
        brandColorSoft={BRAND_COLOR_SOFT}
        brandIcon={<LocavelloMark size={20} />}
        workspacePersist="cookie"
        workspaces={workspaces}
        activeWorkspaceId={activeId}
        sections={SECTIONS}
        credits={chipCredits}
        user={user}
        onLogout={logout}
        dropdownLinks={DROPDOWN_LINKS}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile island header (phones) — the workspace-selector pill
            + round burger that opens the Sidebar drawer. Hidden on lg+. */}
        <MobileHeader
          brandSlug={BRAND_SLUG}
          brandName={BRAND}
          brandColor={BRAND_COLOR}
          brandColorSoft={BRAND_COLOR_SOFT}
          brandIcon={<LocavelloMark size={20} />}
          workspacePersist="cookie"
          workspaces={workspaces}
          activeWorkspaceId={activeId}
          onMenuOpen={() => setOpen(true)}
        />
        {/* pb-52 reserves room for the docked composer so the last row of
            content is never hidden under it. The md:pb-52 is NOT redundant:
            md:p-6 sets padding-bottom too and emits after a bare pb-52. */}
        <main
          className={`min-w-0 flex-1 overflow-y-auto p-4 md:p-6 ${
            assistantEnabled ? 'pb-52 md:pb-52' : ''
          }`}
        >
          {children}
        </main>
        {/* Embedded catentio agent — the docked chat. Lives inside the
            content column so it centers on the CONTENT (sidebar
            excluded). Renders nothing unless the pilot flag says so. */}
        <CatentioDockedChat />
      </div>
    </div>
  );
}

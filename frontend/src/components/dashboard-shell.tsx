'use client';

import { useEffect, useState } from 'react';
import {
  BookMarked,
  BookOpen,
  DatabaseZap,
  FileText,
  KeyRound,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Shield,
} from 'lucide-react';
import {
  Sidebar,
  readActiveWorkspaceId,
  type PortalWorkspace,
  type SessionUser,
  type NavSection,
} from '@forjio/portal-ui';

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
    label: 'Developers',
    items: [{ href: '/dashboard/developers', label: 'API keys & CLI', icon: KeyRound }],
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
    // Best-effort — the template ships no /account/workspaces endpoint;
    // a forked product that proxies Huudis workspaces populates it.
    fetch('/api/v1/account/workspaces', { credentials: 'include' })
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
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        brandSlug={BRAND_SLUG}
        brandName={BRAND}
        brandColor={BRAND_COLOR}
        brandColorSoft={BRAND_COLOR_SOFT}
        brandIcon={<Languages size={20} strokeWidth={2} />}
        workspacePersist="cookie"
        workspaces={workspaces}
        activeWorkspaceId={activeId}
        sections={SECTIONS}
        user={user}
        onLogout={logout}
        dropdownLinks={DROPDOWN_LINKS}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar — the Sidebar drawer has no open trigger of
            its own, so the host renders one. Hidden on lg+. */}
        <div className="flex h-14 items-center border-b border-border bg-card px-4 lg:hidden">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-foreground">
            <Menu className="h-5 w-5" />
          </button>
        </div>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

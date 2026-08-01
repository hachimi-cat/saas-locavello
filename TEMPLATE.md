# TEMPLATE.md — Spawn a new Forjio SaaS in 30 minutes

This is the canonical walkthrough for going from "I have a brand name"
to "the product is live at `<brand>.com` + `<brand>.forjio.com` with
auth, billing, portal, SDKs, CLI, and CI/CD all in family-standard
shape."

Read top-to-bottom in order. Each section names which shared package
or script does the work — **everything referenced here is shipped and
in the repo** (all eight `scripts/*` + the marketing/auth/portal/admin
scaffolds). Reference builds when you need a live example:
`saas-malapos` (shadcn/ui portal), `saas-linksnap` (marketing site),
`saas-serront`/`saas-suppuo` (newest full spawns).

---

## Pre-flight

Decide these before starting. Once chosen, they're load-bearing
across the repo, the GitHub org, the npm/PyPI/Go module namespaces,
the Huudis OIDC client, and the DNS records — changing them later is
a multi-PR exercise.

| Variable        | Example                            | Used by                                              |
|-----------------|------------------------------------|------------------------------------------------------|
| `LOCAVELLO`  | `kalium`                           | Repo slug, npm scope, Go module, env var prefix      |
| `Locavello`  | `Kalium`                           | UI text, README headline, GitHub description         |
| `<one-liner>`   | "Bulk-import CSV → Storlaunch."    | Marketing tagline, GitHub description, README intro  |
| `<accent-hex>`  | `#7C3AED`                          | Brand color across MarketingShell + PortalShell      |
| `<backend-port>`| `4180`                             | Dev port + nginx upstream + CI `BACKEND_PORT`        |
| `<frontend-port>`| `3180`                            | Dev port + nginx upstream + CI `FRONTEND_PORT`       |

Ports: pick the next free pair in the family — grep the sibling
`saas-*` repos under `/root/code` for their `BACKEND_PORT` /
`FRONTEND_PORT`, and consult the staging port ledger at
`/opt/saas/PORTS.md` on the shared staging box. **Never pick a WHATWG
Fetch blocked port for the backend** (4045, 4190, 5060, 5061, 6000,
6566, 6665-6669, 6697, 10080) — Node `fetch()` in the SSR auth gate
silently refuses it and login loops.

---

## Step 1 — Spawn the repo (3 min)

```bash
# From agent-box (repos live under /root/code)
gh repo create hachimi-cat/saas-$LOCAVELLO \
  --template hachimi-cat/forjio-service-template \
  --public \
  --description "<one-liner>" \
  --clone

cd saas-$LOCAVELLO
./scripts/rename.sh kalium "Kalium" "#7C3AED" 4180 3180
git add -A && git commit -m "chore: scaffold from template"
git push origin master
```

`scripts/rename.sh` (✓ shipped 2026-05-19) replaces `LOCAVELLO` / `Forjio
Brand` / port placeholders / brand colors across the entire tree
(backend, frontend, cli, e2e, sdk, scripts, CI workflows, README,
CLAUDE.md). One source of truth — change here, everything else picks
it up.

**Repo standard** (`scripts/standardize.sh` lints, ✓ shipped 2026-05-19):
- Name: `hachimi-cat/saas-<brand>` — no exceptions, no Forjio org
- Description: `<one-liner>` — same string used as MarketingShell
  hero tagline
- README mentions the brand + the product domain
- Semver bumping rule: CLI bumps on every feature commit; backend +
  frontend bump on release tags

Run `./scripts/standardize.sh` after the rename to confirm the fork
meets the bar — 8 rules, exits non-zero on findings. `--fix`
auto-corrects package.json names; `--quick` skips the gh repo-desc
check.

---

## Step 2 — Bootstrap Huudis + Plugipay + Suppuo (5 min)

```bash
export GOJO_HUUDIS_EMAIL=$(cat ~/.config/agents/gojo/credentials.env | grep EMAIL | cut -d= -f2)
export GOJO_HUUDIS_PASSWORD=$(cat ~/.config/agents/gojo/credentials.env | grep PASSWORD | cut -d= -f2)
node scripts/bootstrap.mjs
```

`scripts/bootstrap.mjs` (✓ shipped 2026-05-19) does three things end-to-end:

1. **Register OIDC client in Huudis** — calls
   `POST https://huudis.com/api/v1/oidc/clients` with redirect URIs
   `https://<brand>.com/callback`, `https://<brand>.forjio.com/callback`,
   `http://localhost:3180/callback`. Stores the client_secret in
   `.env` (which is gitignored).

2. **Register partner in Plugipay** — calls Plugipay admin API to
   add `<brand>` to `KNOWN_PARTNERS`. Pattern 2 (Shopify-style)
   partner billing — see
   `project_forjio_plugipay_storlaunch_integration.md`.

3. **Generate `.env.example`** — every secret variable the product
   needs, with empty values + a comment explaining what to put.
   Commit `.env.example`; never commit `.env`.

Output:
```
✓ Huudis OIDC client: clientId=<...> clientSecret=<written to .env>
✓ Plugipay partner: rate=0.3% (family default) — bump via dashboard
✓ Wrote .env (gitignored) + .env.example (committed)
```

**Fallback** (if you skip `bootstrap.mjs`): register the products
manually via the Huudis + Plugipay dashboards and copy the secrets
into a fresh `backend/.env`.

### Claim the Suppuo workspace slug (the 3rd family integration)

Suppuo is the family **helpdesk** — the support counterpart to Huudis
(auth) and Plugipay (billing). The template already ships the four
embed touchpoints (widget + Help-center footer link + contact-page CTA
+ "Support" dashboard nav item), all keyed off the **brand slug** that
`rename.sh` already wrote. There is no secret and no `bootstrap.mjs`
step — but the slug must be claimed once so the public URLs resolve:

1. A product's Suppuo workspace **is** its Huudis workspace — it
   materialises automatically the first time anyone signs into
   `suppuo.com` for that workspace. `gojo@forjio.com` is an admin in
   every Forjio workspace, so sign in there.
2. In Suppuo's **Dashboard → Help center → Branding**, set the
   workspace **slug = `<brand>`** (and, while there, the brand
   logo + accent so the help center / widget match the product).

Until the slug is claimed, the help-center / portal URLs 404 and the
widget no-ops. If you need it working before claiming, swap the brand
slug for the workspace's `acc_…` id in the four embed sites (Suppuo
resolves either form) — but claiming the slug is the family-standard,
gives readable URLs (`suppuo.com/support/<brand>`), and is preferred.

### Secrets — Secronna + spawn-time files

**Secronna (secronna.com) is the Forjio family secrets manager** (12th
family product, live since 2026-07-02). Platform-level tokens (GitHub,
DigitalOcean, npm, PyPI, …) are readable through its API with a reader
token. The **operational path at spawn time is still flat files** under
`/root/.forjio-admin-secrets/` on agent-box — one file per concern
(`<product>`, `<product>-plugipay`, `<product>-resend`, …) — plus box
env at `/opt/saas/<product>/backend/.env` on the prod droplet and the
shared staging box. Migrating per-product secrets into Secronna is a
separate project; don't block a spawn on it. CI secrets go into the
repo via `scripts/seed-ci-secrets.sh` (Step 9).

---

## UI baseline — shadcn/ui (applies to Steps 3-5b)

**shadcn/ui is the family component baseline** (since 2026-06-27;
new-york style, slate base, CSS-var theming). The template ships
`frontend/components.json`, `src/lib/utils.ts` (`cn()`), and the
`src/components/ui/*` primitive set (button / card / table / badge /
dialog / sheet / alert-dialog / dropdown-menu / input / textarea /
label / select / checkbox / switch / tabs / accordion / tooltip /
separator / skeleton / form / sonner + `error-panel`). Build all
product UI on these primitives — `Dialog`/`Sheet` for modals,
`AlertDialog` for confirms, CSS-var tokens
(`bg-card`/`text-muted-foreground`/`text-primary`), never native
`confirm`/`prompt`/`alert` or `bg-black/50` overlays. Add more with
`npx shadcn@latest add <name>`. `saas-malapos` is the reference
implementation. After `rename.sh`, retune `--primary`/`--ring` in
`globals.css` to the brand accent. Full conventions: CLAUDE.md
"Frontend conventions".

---

## Step 3 — Marketing site (10 min)

The marketing site is **hand-coded TSX** — same as every shipped Forjio
product (linksnap is the reference build). The template ships a
complete, designed landing page + sub-pages carrying placeholder copy;
you swap the copy, not the structure.

```
frontend/src/app/(marketing)/
├── layout.tsx              # MarketingShell + Nav + Footer (@forjio/website-ui)
├── page.tsx                # /          home — the locked 9-section page
├── features/page.tsx       # /features
├── pricing/page.tsx        # /pricing   — Free/Pro/Business + comparison table
├── about/page.tsx          # /about
├── contact/page.tsx        # /contact
├── privacy/page.tsx        # /privacy   ┐
├── terms/page.tsx          # /terms     ├ legal — have reviewed before launch
├── refund/page.tsx         # /refund    ┘
├── changelog/page.tsx      # /changelog — reads src/data/changelog.json
└── docs/[[...slug]]/page.tsx # /docs/*  — sidebar + search + on-page TOC
```

**Home page — the locked 9 sections** (every Forjio product has exactly
these, in order): Hero → How it works → Features → Pricing → Comparison
→ For developers → Forjio family → FAQ → CTA. Keep the sections; replace
the placeholder copy with what's true of your product.

**Docs** render from markdown in `copy/docs/*.md` via
`frontend/src/lib/markdown.tsx`. Add a page = drop a `.md` file AND add
an entry to `DOC_NAV` in `markdown.tsx` (the sidebar + search are
DOC_NAV-driven, so order + grouping stay deliberate).

To rebrand the chrome: swap the `<Hexagon>` icon + tagline in
`(marketing)/layout.tsx`, and retune `--primary` / `--ring` in
`frontend/src/app/globals.css` to your accent. Verify against any
shipped product (e.g. `linksnap.forjio.com`) — same structure exactly.

**Shipped:** `@forjio/website-ui` (MarketingShell + Nav + Footer +
Gellix font + docs scaffold: DocsSidebar / DocsToc / DocsSearch /
CrossProductNav), imported by all 8 products and the template.

---

## Step 4 — Auth (already wired)

The template ships working auth — nothing to build, just rebrand:

- **Frontend** — `frontend/src/app/(auth)/{login,signup,forgot-password,
  reset-password}/page.tsx` render `@forjio/auth-ui`'s `AuthForm` /
  `ForgotPasswordForm` / `ResetPasswordForm`. Social buttons
  (Google/Apple) included. Wrapped in the marketing chrome via
  `(auth)/layout.tsx`.
- **Backend** — `backend/src/routes/auth.ts` is a thin `createAuthRouter`
  over the shared `@forjio/sdk/auth-server` BFF kit, mounted at
  `/api/v1/auth`. It serves the exact endpoints `@forjio/auth-ui` posts
  to: `login` / `signup` (Huudis ROPC), `password-reset/*` (proxied to
  Huudis), `huudis/start` + `huudis/callback` (OIDC/PKCE for social),
  `me`, `logout`. Cookie-first — sets `<brand>_session`; sessions are
  stateless HMAC tokens minted by the SDK's `createSessionCodec`
  (configured in `src/auth-config.ts` — no local session table, no
  local user table; identity lives in Huudis).
- **Account + workspace management** — `backend/src/routes/huudis-proxy.ts`
  (`createHuudisProxy`, mounted `/api/v1/huudis`) forwards `/account/*`
  + `/iam/*` to Huudis with the server-side token. The portal does
  profile / password / delete-account and workspace create / rename /
  members straight through it — Huudis stays the source of truth.

`scripts/bootstrap.mjs` writes `HUUDIS_CLIENT_ID` + `HUUDIS_CLIENT_SECRET`
into `backend/.env`; the ROPC + signup grants need the secret. No
product writes its own auth — rebrand the icon/tagline and ship.

---

## Step 5 — Portal shell (already wired)

The template ships the authenticated dashboard chrome:

- `frontend/src/app/(dashboard)/layout.tsx` — the auth gate (no
  `<brand>_session` cookie → redirect to `/login`), resolves the user
  via `/api/v1/auth/me`.
- `frontend/src/components/dashboard-shell.tsx` — renders
  `@forjio/portal-ui`'s `Sidebar` (workspace switcher + nav + profile
  dropdown) beside `<main>`. Add your portal pages as `SECTIONS`
  entries; keep "Overview → Dashboard" first.

Workspace persistence is **cookie** (`<brand>_active_workspace`) — it
survives reloads across subdomains and the backend reads it without a
separate header.

> **DO NOT** use localStorage (storlaunch/linksnap pattern). It
> creates a frontend/backend desync where the X-Account-Id header
> must be threaded by hand on every fetch — the seeded-data capture
> session burned hours on this exact gotcha.

---

## Step 5b — Admin portal (already wired)

Every product spawned from the template ships with a **built-in admin
portal** — a separate, internal staff surface at `/admin/*`, distinct
from the merchant dashboard at `/dashboard`.

**It ships as a shell** — login + forgot/reset password + a dashboard +
the role + gate + BFF proxy. Per-product admin pages (review queues,
moderation, system tooling) are added per-product later; the template
just provides the scaffold.

- **Frontend** — the `(admin)` route group:
  - `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`
    render `@forjio/auth-ui` forms. The login page runs `AuthForm` in
    `admin` mode via `extraBody={{ role: 'admin' }}` (login body) +
    `socialParams={{ role: 'admin' }}` (OIDC start) so the backend
    mints an *admin* session.
  - `/admin/dashboard` — the admin home, behind the gated `(portal)`
    layout (`@forjio/portal-ui` `Sidebar` with `brandTag="Admin"`, run
    in no-workspace mode).
  - `app/api/v1/console/[...path]/route.ts` — the admin BFF proxy.
    Mounted at `/api/v1/console/*` (NOT `/api/v1/admin/*` — that path
    is the backend's; `/console/` avoids the collision). It stamps the
    admin role header and forwards `console/*` → backend `admin/*`
    (`auth/*` passes straight through).
  - `src/components/admin-shell.tsx` — the admin portal chrome. Add
    admin pages as `SECTIONS` entries here.
- **Backend** — `src/auth-config.ts` adds an `admin` role (cookie
  `<brand>_admin_session`, accountId `adm_<sub>`,
  `returnTo: /admin/dashboard`). `src/middleware/admin-guard.ts` guards
  every `/api/v1/admin/*` route: it accepts an `admin` BFF session
  cookie OR the `X-Forjio-Admin-Secret` header (the optional
  server-to-server path, `<BRAND>_ADMIN_SECRET` env var — EXACTLY that
  name; ops gotcha: a droplet env set as `<BRAND>_FORJIO_ADMIN_SECRET`
  is silently ignored and the server-to-server CRM path 401s).
- **nginx** — `deploy/nginx/<brand>.conf` routes `^~ /api/v1/console/`
  to the frontend (the BFF proxy) ahead of the backend default.

**Who gets in:** the admin portal is **gated**. The auth config's
`gate` grants the `admin` role only to a Huudis account that is an
`owner` or `admin` member of *this product's own Huudis workspace*
(the `workspace_role` OIDC claim — needs `@forjio/sdk` ^0.9.0, where
`gate` receives the claims). The merchant role stays ungated and
multi-tenant. A non-admin who signs in at `/admin/login` is rejected
at session-mint time.

> **Add an admin** by adding the person to this product's Huudis
> workspace as an `owner`/`admin` member. There is no per-product
> admin allowlist to maintain — Huudis workspace membership is the
> single source of truth.

---

## Step 6 — Backend + Prisma + outbox (already in template)

The template ships:
- Express + Prisma scaffold (ported from plugipay)
- Huudis OIDC + session + HMAC auth middleware (`@forjio/sdk/auth`)
- Outbox table + processor (ADR-0006)
- `outbox_events` writer for state changes
- API envelope `{ data, error, meta }` from `@forjio/sdk/http`
- Health check at `/api/v1/health`

Add product routes under `backend/src/routes/`. Every state-mutating
route writes to `outbox_events` inside the same Prisma txn. Every
consumer guards on `processed_events(event_id)` unique.

---

## Step 7 — SDKs in 3 languages (5 min)

```bash
./scripts/codegen-sdk.sh all   # ✓ shipped — js | python | go | all
```

Scaffolds three SDK shells under `sdks/`, each with the canonical
Forjio family shape (transport, envelope, error class, config) and a
marked "endpoint methods" section to fill in by hand:

```
sdks/
├── js/        → @forjio/<brand>          → npm publish (wraps @forjio/sdk)
├── python/    → forjio-<brand>           → PyPI publish (wraps forjio-sdk)
└── go/        → github.com/hachimi-cat/<brand>-go → git tag (wraps forjio-go)
```

It does NOT generate from an OpenAPI spec — most Forjio backends don't
emit one. You fill in the endpoint methods, mirroring all three SDKs
1:1 (same paths, same param names).

**Today's fallback:** none needed — run the script, then hand-write the
endpoint methods per the saas-plugipay/sdk pattern.

---

## Step 8 — CLI app (already in template)

`cli/` is a Commander-based CLI shipping `auth login`, `auth whoami`,
and the OAuth device-flow client. Add your product commands under
`cli/src/commands/`. Published as `@forjio/<brand>-cli` on npm via
CI on every feature commit.

**Don't forget:** register the CLI as a device-flow OIDC client in
Huudis, otherwise `auth login` returns `invalid_client`. Three CLIs
are currently in this state per memory: `linksnap-cli`, `pawpado-cli`,
`catentio-saas-cli`. Don't repeat that — bootstrap.ts will register
it for you.

---

## Step 9 — CI/CD (10 min)

The template's `.github/workflows/ci-cd.yml` runs the canonical
sequence:

```
lint → test → build → deploy-staging → e2e-staging → deploy-production → release
```

**Staging is the SHARED box, reached over the tailnet** (the
2026-06-15 consolidation put all products' staging on one box; its
tailnet IP is `100.123.65.113` and it is only routable over the
tailnet). `deploy-staging`, `e2e-staging`, and `visual-regression`
each join the tailnet as an ephemeral CI node via
`tailscale/github-action` (`TS_AUTHKEY`, a reusable + ephemeral key),
then map `STAGING_HOST` (= `staging-<brand>.forjio.com` — keep the
hostname, nginx routes the ~10 staging vhosts by Host header) to the
box's tailnet IP in `/etc/hosts`. Plain host rsync/ssh — NOT the
containerized rsync actions, which can't see the runner's tailnet
route. Dual wait-for-staging loops (backend health + frontend root),
PM2 deploys, build-once artifacts.

**Required GitHub secrets** — `scripts/seed-ci-secrets.sh` sets these
via the `gh` CLI (prompts for each, or pre-fill with env vars):

| Secret                | Used in                                      |
|-----------------------|----------------------------------------------|
| `STAGING_HOST`        | staging hostname (`staging-<brand>.forjio.com`) — deploy target + e2e base host |
| `PRODUCTION_HOST`     | rsync deploy prod                            |
| `SSH_PRIVATE_KEY`     | rsync/ssh deploys (staging + prod)           |
| `TS_AUTHKEY`          | tailscale connect (staging jobs)             |
| `E2E_BYPASS_SECRET`   | playwright auth bypass                       |
| `NPM_TOKEN`           | CLI publish in the release job               |
| `MIDTRANS_CLIENT_KEY` | payment products only — blank otherwise      |

Runtime secrets (`HUUDIS_CLIENT_SECRET`, `DATABASE_URL`, …) are NOT CI
secrets — they live in the box `.env` files (see the Secrets section).

**Visual regression runs on workflow_dispatch only** (not push). See
`feedback_ci_visual_baseline_race` — push-gated visual regression
churns marketing PRs. Dispatch with `update_baselines=true` to
refresh, dispatch without to strict-compare for drift.

**Build-once optimization** — the `build` job uploads its artifacts,
deploy-staging + deploy-production both pull from the same artifact.
Single `pnpm build`, two deploys. See S-066 / S-067 history.

---

## Step 10 — DigitalOcean provisioning (5 min)

```bash
./scripts/provision-do.sh kalium   # ✓ shipped
```

Walks through, idempotent (safe to re-run on partial failures):

> **Staging convention (2026-06-15 consolidation): there is no
> per-product staging droplet.** Staging for every product lives on
> the SHARED staging box (public `129.212.234.54`, reached by CI over
> the tailnet at `100.123.65.113`). **The script enforces this** — it
> provisions the prod droplet only, points
> `staging-<brand>.forjio.com` at the shared box, and prints the
> box-side registration checklist. Work through that checklist (it is
> the spawn-product skill's Phase 1 step 8): port pair in
> `/opt/saas/PORTS.md`, staging DB + role, `.env`, CI deploy pubkey,
> nginx vhost, certbot.

1. **Droplet creation** — creates `prd-<brand>` (s-2vcpu-2gb, $18/mo)
   in `sgp1`, tagged `forjio-family`. **Prod only** — one droplet.
2. **DNS records** — adds A records on both zones (`<brand>.com` if
   you own it + `<brand>.forjio.com`):
   - `<brand>.com` → prod droplet IP
   - `www.<brand>.com` → prod droplet IP
   - `staging-<brand>.forjio.com` → shared staging box (in the
     forjio.com zone — NOT a dedicated droplet)
   - `<brand>.forjio.com` → prod droplet IP (canonical .forjio.com mirror)

   No `staging.<brand>.com` record — the staging hostname is
   `staging-<brand>.forjio.com`, which is what `STAGING_HOST` and the
   CI deploy/e2e jobs use.
3. **install.sh on the prod droplet** — `scripts/install.sh` ships in
   the template: 2GB swap, Node 22, pnpm, pm2, nginx, certbot,
   PostgreSQL 16, UFW. Idempotent. Never run it against the shared
   staging box — it would stomp the nginx + postgres config the other
   products' staging depends on (that box rebuilds from its own
   `/opt/saas/setup-box.sh`). NOTE: the nginx-vhost step is a no-op on
   the FIRST provision (the repo isn't rsynced to `/opt/saas/<brand>`
   until the first CI deploy) — after that deploy, symlink + reload
   manually or just re-run install.sh:
   ```bash
   ln -sf /opt/saas/<brand>/deploy/nginx/*.conf /etc/nginx/sites-enabled/<brand>.conf
   nginx -t && systemctl reload nginx
   ```
4. **Certbot** — `--webroot` for the prod domains. NOT `--nginx` (that
   bites the auth_request `return 301` interaction —
   `feedback_nginx_auth_request_no_rotation.md`). The staging cert, if
   the product forces https, is issued ON the shared box.
5. **Shared-staging checklist** — printed at the end of the run; do it
   before the first `deploy-staging` CI job, or the job has nowhere to
   land.
6. **Forjio dual-domain rule** — every product serves at BOTH
   `<brand>.com` AND `<brand>.forjio.com`. Never delete the .forjio.com
   half during cleanup. (`feedback_forjio_family_dual_domains.md`)

**Droplet naming:** `prd-<brand>`. Locked. (No `stg-<brand>` droplets
since the shared-staging consolidation.)

---

## Step 11 — Seed demo data (5 min)

```bash
node scripts/seed-demo.mjs   # ✓ shipped
```

Creates a workspace called "Forjio Demo" in the new product's Huudis
workspace list and populates it with 5-15 realistic records per
domain entity (customers, orders, links, agents, etc — whatever this
product owns).

This solves the empty-state-screenshot problem we burned hours on for
forjio.com's portal tour: every product detail page on forjio.com
needs a *visible* screenshot of the portal with data flowing, not the
"Create your first X" empty state. Bootstrap a new product, run
seed-demo.ts, capture screenshots → done.

The data is realistic Indonesian-merchant flavored (Toko Naila / Kopi
Kecil / Batik Bintang etc — see the customer list used in plugipay's
seed). Keeps marketing screenshots looking like real merchants are
using the product, not test fixtures.

---

## Step 12 — Verification checklist

Before announcing the product live, every box must tick:

- [ ] `<brand>.com` and `<brand>.forjio.com` both 200 with valid TLS
- [ ] Marketing site renders the canonical 10 pages, footer entity =
      "PT Forjio Teknologi Indonesia"
- [ ] `https://<brand>.com/login` → email/password form, signs in
      against Huudis OIDC, redirects to `/dashboard`
- [ ] Portal sidebar matches every other product (workspace switcher
      top, profile dropdown bottom, sections in between)
- [ ] `https://<brand>.com/admin/login` → admin login form; an
      owner/admin of the product's Huudis workspace signs in and lands
      on `/admin/dashboard`; a non-admin Huudis account is rejected
- [ ] `https://forjio.com/engine/<brand>` has a tour entry pointing
      at real portal screenshots (seeded data, not empty state)
- [ ] CI green on master, all 7 jobs (lint → test → build → staging
      → e2e → prod → optional visual)
- [ ] CLI installable: `npm i -g @forjio/<brand>-cli && <brand> auth login`
- [ ] SDK installable: `npm i @forjio/<brand>-sdk-js`, `pip install
      forjio-<brand>`, `go get github.com/hachimi-cat/<brand>-go`
- [ ] `<brand>.com/docs` renders (markdown from `copy/docs/`)
- [ ] Plugipay dashboard shows `<brand>` in KNOWN_PARTNERS
- [ ] Huudis dashboard shows `<brand>` in OIDC clients
- [ ] Footer of `<brand>.com` links back to `forjio.com` family hub

---

## Shipped inventory

Everything in the template is shipped — nothing in this doc is
planned/pending. Provenance table:

| Component                    | Status   | Notes                                       |
|------------------------------|----------|---------------------------------------------|
| Backend Express+Prisma       | ✓ ported | from plugipay 2026-04-20                    |
| Frontend Next.js+api.ts      | ✓ ported | from plugipay 2026-04-20                    |
| CLI Commander scaffold       | ✓ ported | auth login/whoami ships                     |
| E2E Playwright + session     | ✓ ported | health smoke ships                          |
| CI/CD ci-cd.yml              | ✓ live   | re-ported from linksnap 2026-05-19 (sprint) |
| `@forjio/website-ui`         | ✓ live   | published, all 8 products use it            |
| `@forjio/sdk`                | ✓ live   | published, all 8 products use it            |
| Per-product SDKs (JS/PY/GO)  | ✓ live   | published per product                       |
| `@forjio/auth-ui`            | ✓ live   | extracted from plugipay 2026-05-19 (sprint) |
| `@forjio/portal-ui`          | ✓ live   | extracted from plugipay 2026-05-19 (sprint) |
| `scripts/rename.sh`          | ✓ live   | brand placeholder replacer (sprint)         |
| `scripts/bootstrap.mjs`      | ✓ live   | Huudis OIDC (Plugipay step → manual PR)     |
| `scripts/seed-demo.mjs`      | ✓ live   | canonical Indonesian-merchant seeds         |
| `scripts/provision-do.sh`    | ✓ live   | droplets + DNS + install + certbot (sprint) |
| `(marketing)/` TSX pages     | ✓ live   | 9-section home + sub-pages, linksnap-faithful |
| `copy/docs/` + markdown.tsx  | ✓ live   | docs render from markdown, family pattern    |
| `(auth)/` pages              | ✓ live   | login/signup/forgot/reset via @forjio/auth-ui |
| `(dashboard)/` portal shell  | ✓ live   | auth gate + Sidebar via @forjio/portal-ui    |
| `(admin)/` admin portal      | ✓ live   | login/forgot/reset + dashboard, gated on workspace_role |
| `backend/admin-guard.ts`     | ✓ live   | admin session OR X-Forjio-Admin-Secret guard |
| `deploy/nginx/<brand>.conf`  | ✓ live   | reference vhost — /api/v1/console proxy rule |
| `backend/routes/auth.ts`     | ✓ live   | cookie-first Huudis SSO — login/signup/OIDC  |
| `scripts/standardize.sh`     | ✓ live   | 8-rule fork linter, --fix/--quick (sprint)  |
| `scripts/codegen-sdk.sh`     | ✓ live   | scaffolds JS/Python/Go SDK shells (sprint)  |
| `scripts/install.sh`         | ✓ live   | DO droplet bootstrap (swap/node/pg/nginx)   |
| `scripts/seed-ci-secrets.sh` | ✓ live   | sets the CI secrets via gh                  |
| shadcn/ui baseline           | ✓ live   | components.json + ui/* set, family baseline 2026-06-27 |
| Tailnet shared-staging CI    | ✓ live   | deploy-stg/e2e/visual over Tailscale, 2026-06-25 |

---

## Refresh sprint — 2026-05-19 ship report

Sprint landed on 2026-05-19, single autonomous session:

- ✓ CI/CD re-ported from saas-linksnap (build-once + visual-regression
  opt-in, LOCAVELLO placeholder)
- ✓ `scripts/rename.sh` — idempotent brand placeholder + port + accent
  replacer (validates on bad inputs, prints per-file ✓ summary)
- ✓ `scripts/bootstrap.mjs` — Huudis OIDC client registration (real
  API); Plugipay step prints the manual-PR URL since KNOWN_PARTNERS
  is a TS literal in saas-plugipay
- ✓ `@forjio/portal-ui` extracted + published at
  github.com/hachimi-cat/forjio-portal-ui (Sidebar + WorkspaceSwitcher
  + ProfileDropdown, cookie persistence as canonical)
- ✓ `@forjio/auth-ui` extracted + published at
  github.com/hachimi-cat/forjio-auth-ui (AuthForm + ForgotPasswordForm
  + ResetPasswordForm, brand + endpoints + providers props)
- ✓ `scripts/seed-demo.mjs` — canonical Indonesian-merchant set
  (FORJIO_DEMO_MERCHANTS + FORJIO_DEMO_PRODUCTS) reused across family
- ✓ `scripts/provision-do.sh` — DigitalOcean orchestration ready to
  run (not executed in sprint; first real use waits for a 9th SaaS
  spawn)
- ✓ `scripts/standardize.sh` — 8-rule fork linter (placeholders, dirs,
  package naming, CLAUDE.md, README, ci-cd.yml brand refs, CLI scope,
  GitHub repo description). `--fix` + `--quick` modes
- ✓ `scripts/codegen-sdk.sh` — scaffolds `sdks/{js,python,go}/` SDK
  shells wired against `@forjio/sdk` / `forjio-sdk` / `forjio-go`
- ✓ `@forjio/portal-ui` + `@forjio/auth-ui` published to npm at 0.1.1
  (0.1.0 hit npm's 24h republish hold — bump to 0.1.1 was the fix)
- ✓ End-to-end validation — spawned a `testkalium` fork and ran
  rename → seed-demo --dry-run → codegen-sdk all → standardize; all 7
  standardize rules pass clean
- ✓ Marketing site — hand-coded TSX `(marketing)` pages ported from
  linksnap (the family reference): 9-section home + features / pricing /
  about / contact / legal / changelog, plus `copy/docs/` markdown docs
  via `markdown.tsx`. Build-tested green (18 static pages).

The v2 refresh sprint is complete — the template now spawns a fully
runnable Forjio SaaS, marketing site included, structurally identical
to the 8 shipped products.

---

## Anti-patterns to avoid

- **localStorage workspace persistence** — see Step 5. Cookie only.
- **Dual-write between products** — see `feedback_storlaunch_module_gating_rule`.
  Pure proxy via SDK if data lives in another product.
- **`usr_*` accountIds for partner-provisioned data** — always
  `acc_<workspaceId>`. Two namespaces never cross
  (`project_fulkruma_accountid_namespaces`).
- **`return 301` in port-80 nginx blocks** — blocks acme-challenge.
  Use `certbot --webroot`, not `certbot --nginx`.
- **Sibling-path upload-artifact in CI** — strips common prefix,
  silently restructures the archive
  (`feedback_github_actions_artifact_lca`). Ship sibling-prefix dirs
  as separate artifacts.
- **Bare TestClient(app) with `with` block** — hangs on apps with
  background workers (`feedback_fastapi_testclient_bare`). Use bare
  `TestClient(app)` for sync request/response assertions.
- **Skipping Forjio dual-domain rule** — keep both `<brand>.com` and
  `<brand>.forjio.com` alive. Never delete the .forjio.com half.
- **Indonesian-framing on every product** — keep for products with a
  regulatory tether (Plugipay, Fulkruma). Drop for the rest
  (Huudis, LinkSnap, Catentio, Pawpado) per
  `project_forjio_landing_family`.

---

## Living doc

Bump the date on every refresh and keep the inventory table honest
against the tree. (`TEMPLATE-UPGRADE-AUDIT.md` is historical — the
2026-04-20 audit that seeded the scaffolding; this walkthrough is the
source of truth now.)

Last updated: 2026-07-11 (reality refresh — shadcn/ui baseline section,
tailnet shared-staging CI documented as the one convention (matching
ci-cd.yml + the whole fleet's green pipelines), correct CI-secrets
table, Secronna secrets section, prod-only droplet provisioning,
dev-machine references purged: the working host is agent-box, repos
under /root/code).

Previously: 2026-05-22 (admin-portal scaffold added — every spawned
product ships a built-in admin portal: (admin) route group, the
`admin` role + workspace_role gate, admin-guard, the /api/v1/console
BFF proxy, and the deploy/nginx reference vhost. @forjio/sdk bumped to
^0.9.0, auth-ui/portal-ui to the production reference versions).
2026-05-20 (v2 spec — refresh sprint complete + auth/portal gap closed:
(auth) pages, (dashboard) portal shell, backend auth router, install.sh,
seed-ci-secrets.sh all shipped and build-validated).

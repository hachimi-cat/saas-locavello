# Forjio Service Template

Template repo for every Forjio product (huudis, plugipay, storlaunch,
fulkruma, ripllo, malapos, suppuo). One `gh repo create --template`
command and you have a running backend + frontend + CLI scaffold with
`@forjio/sdk` wired in.

Not a product. Not cloneable as-is into production — each product adds
its own domain model on top.

## What's in here

```
backend/     Express + Prisma + Vitest. Auth middleware via @forjio/sdk/auth.
             Prisma schema has ONLY outbox_events + processed_events
             (ADR-0006). The polling worker is wired but has no subscribers
             until the hosting product adds them.
frontend/    Next.js 15 App Router. Marketing route group (landing) +
             dashboard route group (auth-gated shell) + OIDC callback
             wired via @forjio/sdk.
cli/         Commander-based CLI. `auth login` via device flow +
             `auth whoami`. Publishes as @forjio/<brand>-cli after you
             rename in package.json.
e2e/         Playwright config + a health smoke test.
.github/     CI workflow: lint → test → build. Deploy workflow is
             per-product (varies by droplet/nginx/systemd) and must be
             added in each repo.
```

## Create a new product from this template

```bash
gh repo create hachimi-cat/<brand> --template=hachimi-cat/forjio-service-template --public
git clone git@github.com:hachimi-cat/<brand>.git
cd <brand>
./scripts/rename.sh <brand> "<Brand>" "<#accent>" <bePort> <fePort>
```

Then follow [TEMPLATE.md](./TEMPLATE.md) — the step-by-step fork guide
(rename → bootstrap Huudis/Plugipay → marketing → auth → SDKs → deploy).

## Stay in sync with template updates

Each downstream repo can pull template improvements later:

```bash
git remote add template git@github.com:hachimi-cat/forjio-service-template.git
git fetch template
git merge template/master --allow-unrelated-histories
# Resolve conflicts manually — most churn should be in scaffolding/config.
```

## Philosophy

- **No placeholder features.** The landing page says "<Brand>" and has
  three empty cards. The dashboard is an auth gate + header. That's it.
- **No placeholder data model.** Prisma has outbox tables only. You add
  your product's tables on top.
- **SDK-first.** Auth, envelope, ARN, events come from `@forjio/sdk` —
  never reinvent them inside a product.
- **Matches the Storlaunch/LinkSnap shape.** If you've worked in either,
  this template is already familiar.

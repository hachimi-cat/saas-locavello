# Locavello

Locavello is a Forjio family product. Served at
[locavello.com](https://locavello.com) and mirrored at
[locavello.forjio.com](https://locavello.forjio.com).

## What this repo contains

- `backend/` — Express + Prisma API
- `frontend/` — Next.js 15 App Router (marketing site + dashboard)
- `cli/` — `@forjio/locavello-cli` Commander-based CLI
- `e2e/` — Playwright suite (local + CI-against-staging)
- `copy/docs/` — markdown docs rendered at `/docs`
- `scripts/` — bootstrap, seed-demo, provision-do, standardize, codegen-sdk

## Develop

```bash
cd backend  && npm install && npm run dev   # :4270
cd frontend && npm install && npm run dev   # :3270
```

See [CLAUDE.md](./CLAUDE.md) for in-repo conventions and the wider
Forjio family architecture.

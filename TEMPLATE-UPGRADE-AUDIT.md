# Template Upgrade Audit — historical

**This document is historical.** It was the 2026-04-20 audit of four
Forjio product repos (`saas-linksnap`, `saas-storlaunch`, `saas-huudis`,
`saas-plugipay`) that picked the battle-tested patterns the original
template scaffolding was built from.

Everything it decided has since either shipped into the template or been
superseded by later fleet-wide changes (shared tailnet staging, shadcn/ui
baseline, dynamic-Next deploys, the admin portal scaffold, …).

**Superseded by [`TEMPLATE.md`](./TEMPLATE.md) as of 2026-07-11** — that
is the living walkthrough and the single source of truth for what the
template ships and why. For per-pattern rationale, the original audit
text lives in git history (`git log -- TEMPLATE-UPGRADE-AUDIT.md`, last
full version at commit d2c8dff and earlier).

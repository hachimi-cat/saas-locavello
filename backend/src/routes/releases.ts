import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, pathParam, notFound, sendCreated, sendList, sendOk } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { encodeCursor, parsePagination } from '../lib/cursor.js';
import { canonicalCatalogJson, catalogHash, catalogKeyName } from '../lib/catalog.js';
import { checkPlaceholders, estimateDisplayLength } from '../lib/icu.js';
import { pseudoizeCatalog } from '../lib/pseudo.js';
import { writeOutbox } from '../lib/outbox.js';
import { recordAudit, actorOf } from '../lib/audit.js';
import { ownedProject } from './projects.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

/**
 * Build the publishable catalog for (project, locale). Approved
 * translations always ship; machine translations ship only from
 * namespaces with the 'standard' review policy — 'gated' namespaces
 * (legal, pricing) are approved-only, always.
 */
async function buildCatalog(projectId: string, locale: string) {
  const keys = await prisma.key.findMany({
    where: { projectId, archived: false },
    include: {
      namespace: { select: { name: true, reviewPolicy: true } },
      translations: { where: { locale } },
    },
  });
  const catalog: Record<string, string> = {};
  let translated = 0;
  let missing = 0;
  for (const key of keys) {
    const tr = key.translations[0];
    const eligible =
      tr &&
      (tr.status === 'approved' ||
        (tr.status === 'machine' && key.namespace.reviewPolicy === 'standard') ||
        (tr.status === 'needs_review' && key.namespace.reviewPolicy === 'standard'));
    const name = catalogKeyName(key.namespace.name, key.name);
    if (eligible) {
      catalog[name] = tr.value;
      translated += 1;
    } else {
      missing += 1;
    }
  }
  return { catalog, translated, missing, keyCount: keys.length };
}

const publishSchema = z.object({
  locale: z.string().min(2),
});

/**
 * POST /projects/:id/releases — publish. Idempotent on content: same
 * catalog → the existing release is returned, no new row.
 */
router.post(
  '/:id/releases',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = publishSchema.parse(req.body ?? {});
    const localeRow = await prisma.projectLocale.findUnique({
      where: { projectId_tag: { projectId: project.id, tag: body.locale } },
    });
    if (!localeRow) throw notFound(`locale "${body.locale}" not enabled for this project`);

    const { catalog, translated, keyCount } = await buildCatalog(project.id, body.locale);
    const hash = catalogHash(catalog);

    const existing = await prisma.release.findUnique({
      where: {
        projectId_locale_contentHash: {
          projectId: project.id,
          locale: body.locale,
          contentHash: hash,
        },
      },
    });
    if (existing) return sendOk(res, req, { ...existing, unchanged: true });

    const release = await prisma.$transaction(async (tx) => {
      const created = await tx.release.create({
        data: {
          id: newId('rel'),
          projectId: project.id,
          locale: body.locale,
          contentHash: hash,
          catalog,
          keyCount: translated,
          createdBy: req.auth?.sub ?? null,
        },
      });
      await writeOutbox(tx, {
        type: 'locavello.release.published.v1',
        accountId: project.accountId,
        aggregateId: project.id,
        data: {
          releaseId: created.id,
          locale: body.locale,
          contentHash: hash,
          keyCount: translated,
          totalKeys: keyCount,
        },
      });
      return created;
    });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'release.published',
      target: { type: 'release', id: release.id },
      summary: `Published ${body.locale} release of "${project.name}" (${translated}/${keyCount} keys)`,
      metadata: { projectId: project.id, locale: body.locale, contentHash: hash, keyCount: translated },
    });
    return sendCreated(res, req, release);
  }),
);

router.get(
  '/:id/releases',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
    const rows = await prisma.release.findMany({
      where: {
        projectId: project.id,
        ...(locale ? { locale } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        locale: true,
        contentHash: true,
        keyCount: true,
        createdBy: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return sendList(res, req, page, next, hasMore);
  }),
);

/** GET /releases/:id — the frozen catalog (Mode B serving + diffs read this). */
router.get(
  '/releases/:releaseId',
  h(async (req, res) => {
    const release = await prisma.release.findUnique({
      where: { id: pathParam(req, 'releaseId') },
      include: { project: { select: { accountId: true } } },
    });
    if (!release || release.project.accountId !== accountId(req)) throw notFound('release not found');
    const { project: _p, ...row } = release;
    return sendOk(res, req, row);
  }),
);

/**
 * GET /projects/:id/pull — the CI endpoint. Returns, per enabled
 * locale, the latest release's catalog (or a draft build when no
 * release exists yet and ?draft=true). Also returns the source-locale
 * key list so the CLI can emit locavello.d.ts. `en-XA` (pseudo) is
 * synthesized on the fly from source text — no account cost.
 */
router.get(
  '/:id/pull',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const draft = req.query.draft === 'true';
    const wantPseudo = req.query.pseudo === 'true';

    const locales = await prisma.projectLocale.findMany({
      where: { projectId: project.id, enabled: true },
    });
    const out: Record<
      string,
      { catalog: Record<string, string>; releaseId: string | null; contentHash: string }
    > = {};
    for (const locale of locales) {
      const latest = await prisma.release.findFirst({
        where: { projectId: project.id, locale: locale.tag },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        out[locale.tag] = {
          catalog: latest.catalog as Record<string, string>,
          releaseId: latest.id,
          contentHash: latest.contentHash,
        };
      } else if (draft) {
        const { catalog } = await buildCatalog(project.id, locale.tag);
        out[locale.tag] = { catalog, releaseId: null, contentHash: catalogHash(catalog) };
      }
    }

    // Source keys — the d.ts input + the en.json the repo owns.
    const keys = await prisma.key.findMany({
      where: { projectId: project.id, archived: false },
      include: { namespace: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const source: Record<string, string> = {};
    for (const key of keys) source[catalogKeyName(key.namespace.name, key.name)] = key.sourceText;

    if (wantPseudo) {
      out['en-XA'] = {
        catalog: pseudoizeCatalog(source),
        releaseId: null,
        contentHash: catalogHash(source),
      };
    }

    return sendOk(res, req, {
      projectId: project.id,
      sourceLocale: project.sourceLocale,
      source,
      locales: out,
      fallbacks: Object.fromEntries(locales.map((l) => [l.tag, l.fallback])),
    });
  }),
);

/**
 * GET /projects/:id/check — the CI gate report. Non-empty `errors`
 * should fail the build. Everything here is mechanical: missing keys
 * per enabled locale, placeholder mismatches, length overflows, and
 * glossary violations (do-not-translate terms that got translated
 * away).
 */
router.get(
  '/:id/check',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const [locales, keys, glossary] = await Promise.all([
      prisma.projectLocale.findMany({ where: { projectId: project.id, enabled: true } }),
      prisma.key.findMany({
        where: { projectId: project.id, archived: false },
        include: {
          namespace: { select: { name: true, reviewPolicy: true } },
          translations: true,
        },
      }),
      prisma.glossaryTerm.findMany({
        where: {
          accountId: project.accountId,
          OR: [{ projectId: project.id }, { projectId: null }],
        },
      }),
    ]);

    const dntTerms = glossary.filter((g) => g.translation === null).map((g) => g.term);
    const errors: Array<Record<string, unknown>> = [];
    const warnings: Array<Record<string, unknown>> = [];

    for (const locale of locales) {
      for (const key of keys) {
        const name = catalogKeyName(key.namespace.name, key.name);
        const tr = key.translations.find((t) => t.locale === locale.tag);
        if (!tr || tr.status === 'rejected') {
          errors.push({ type: 'missing_key', locale: locale.tag, key: name });
          continue;
        }
        const check = checkPlaceholders(key.sourceText, tr.value);
        if (!check.ok) {
          errors.push({
            type: 'placeholder_mismatch',
            locale: locale.tag,
            key: name,
            missing: check.missing,
            extra: check.extra,
          });
        }
        if (key.maxLength && estimateDisplayLength(tr.value) > key.maxLength) {
          warnings.push({
            type: 'length_overflow',
            locale: locale.tag,
            key: name,
            maxLength: key.maxLength,
            estimated: estimateDisplayLength(tr.value),
          });
        }
        for (const term of dntTerms) {
          if (key.sourceText.includes(term) && !tr.value.includes(term)) {
            warnings.push({ type: 'glossary_violation', locale: locale.tag, key: name, term });
          }
        }
        if (tr.status === 'needs_review' || tr.status === 'machine') {
          warnings.push({ type: 'unreviewed', locale: locale.tag, key: name, status: tr.status });
        }
      }
    }

    return sendOk(res, req, {
      ok: errors.length === 0,
      errors,
      warnings,
      stats: { keys: keys.length, locales: locales.length },
    });
  }),
);

/** GET /releases/:a/diff/:b — key-level diff between two releases. */
router.get(
  '/releases/:a/diff/:b',
  h(async (req, res) => {
    const [ra, rb] = await Promise.all([
      prisma.release.findUnique({
        where: { id: pathParam(req, 'a') },
        include: { project: { select: { accountId: true } } },
      }),
      prisma.release.findUnique({
        where: { id: pathParam(req, 'b') },
        include: { project: { select: { accountId: true } } },
      }),
    ]);
    const acc = accountId(req);
    if (!ra || ra.project.accountId !== acc) throw notFound('release not found');
    if (!rb || rb.project.accountId !== acc) throw notFound('release not found');
    const ca = ra.catalog as Record<string, string>;
    const cb = rb.catalog as Record<string, string>;
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ key: string; from: string; to: string }> = [];
    for (const k of Object.keys(cb)) {
      if (!(k in ca)) added.push(k);
      else if (ca[k] !== cb[k]) changed.push({ key: k, from: ca[k]!, to: cb[k]! });
    }
    for (const k of Object.keys(ca)) if (!(k in cb)) removed.push(k);
    return sendOk(res, req, {
      a: { id: ra.id, hash: ra.contentHash },
      b: { id: rb.id, hash: rb.contentHash },
      added: added.sort(),
      removed: removed.sort(),
      changed: changed.sort((x, y) => x.key.localeCompare(y.key)),
    });
  }),
);

export { buildCatalog, canonicalCatalogJson };
export default router;

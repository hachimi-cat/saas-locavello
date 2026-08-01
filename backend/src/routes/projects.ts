import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, pathParam, conflict, notFound, sendCreated, sendList, sendOk } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { encodeCursor, parsePagination } from '../lib/cursor.js';
import { writeOutbox } from '../lib/outbox.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

/** Load a project owned by the caller's account or 404. */
export async function ownedProject(req: Request, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.accountId !== accountId(req)) throw notFound('project not found');
  return project;
}

const localeTag = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, 'must be a BCP-47 tag like "id" or "pt-BR"');

const createProjectSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]{1,63}$/, 'lowercase alphanumeric/hyphen, 2-64 chars'),
  name: z.string().min(1).max(200),
  sourceLocale: localeTag.default('en'),
  mode: z.enum(['sdk', 'proxy']).default('sdk'),
  siteUrl: z.string().url().max(500).optional(),
});

router.post(
  '/',
  h(async (req, res) => {
    const body = createProjectSchema.parse(req.body ?? {});
    if (body.mode === 'proxy' && !body.siteUrl) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'proxy projects require siteUrl', 'siteUrl');
    }
    const existing = await prisma.project.findUnique({
      where: { accountId_slug: { accountId: accountId(req), slug: body.slug } },
    });
    if (existing) throw conflict(`project "${body.slug}" already exists`);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          id: newId('prj'),
          accountId: accountId(req),
          slug: body.slug,
          name: body.name,
          sourceLocale: body.sourceLocale,
          mode: body.mode,
          siteUrl: body.siteUrl ?? null,
        },
      });
      await tx.namespace.create({
        data: { id: newId('ns'), projectId: created.id, name: 'default' },
      });
      await writeOutbox(tx, {
        type: 'locavello.project.created.v1',
        accountId: created.accountId,
        aggregateId: created.id,
        data: { projectId: created.id, slug: created.slug, mode: created.mode },
      });
      return created;
    });
    return sendCreated(res, req, project);
  }),
);

router.get(
  '/',
  h(async (req, res) => {
    const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
    const rows = await prisma.project.findMany({
      where: {
        accountId: accountId(req),
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
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next = hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return sendList(res, req, page, next, hasMore);
  }),
);

/** Per-locale completion for a project — the Projects screen's data. */
async function localeStats(projectId: string) {
  const [locales, keyCount, counts] = await Promise.all([
    prisma.projectLocale.findMany({ where: { projectId }, orderBy: { tag: 'asc' } }),
    prisma.key.count({ where: { projectId, archived: false } }),
    prisma.translation.groupBy({
      by: ['locale', 'status'],
      where: { key: { projectId, archived: false } },
      _count: { _all: true },
    }),
  ]);
  return locales.map((l) => {
    const byStatus: Record<string, number> = {};
    for (const c of counts) {
      if (c.locale === l.tag) byStatus[c.status] = c._count._all;
    }
    const approved = byStatus.approved ?? 0;
    const machine = byStatus.machine ?? 0;
    const needsReview = byStatus.needs_review ?? 0;
    return {
      ...l,
      keyCount,
      approved,
      machine,
      needsReview,
      missing: Math.max(0, keyCount - approved - machine - needsReview),
    };
  });
}

router.get(
  '/:id',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const [locales, namespaces, lastRelease] = await Promise.all([
      localeStats(project.id),
      prisma.namespace.findMany({ where: { projectId: project.id }, orderBy: { name: 'asc' } }),
      prisma.release.findFirst({
        where: { projectId: project.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, locale: true, createdAt: true, keyCount: true },
      }),
    ]);
    return sendOk(res, req, { ...project, locales, namespaces, lastRelease });
  }),
);

const patchProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  siteUrl: z.string().url().max(500).nullable().optional(),
});

router.patch(
  '/:id',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = patchProjectSchema.parse(req.body ?? {});
    const updated = await prisma.project.update({ where: { id: project.id }, data: body });
    return sendOk(res, req, updated);
  }),
);

// ── Locales ─────────────────────────────────────────────────────────

const addLocaleSchema = z.object({
  tag: localeTag,
  fallback: localeTag.nullable().optional(),
  rtl: z.boolean().default(false),
});

router.post(
  '/:id/locales',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = addLocaleSchema.parse(req.body ?? {});
    if (body.tag === project.sourceLocale) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'source locale is implicit — add targets only', 'tag');
    }
    const existing = await prisma.projectLocale.findUnique({
      where: { projectId_tag: { projectId: project.id, tag: body.tag } },
    });
    if (existing) throw conflict(`locale "${body.tag}" already added`);
    const locale = await prisma.projectLocale.create({
      data: {
        id: newId('loc'),
        projectId: project.id,
        tag: body.tag,
        fallback: body.fallback ?? null,
        rtl: body.rtl,
      },
    });
    return sendCreated(res, req, locale);
  }),
);

const patchLocaleSchema = z.object({
  fallback: localeTag.nullable().optional(),
  rtl: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

router.patch(
  '/:id/locales/:tag',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = patchLocaleSchema.parse(req.body ?? {});
    const locale = await prisma.projectLocale.findUnique({
      where: { projectId_tag: { projectId: project.id, tag: pathParam(req, 'tag') } },
    });
    if (!locale) throw notFound('locale not found');
    const updated = await prisma.projectLocale.update({ where: { id: locale.id }, data: body });
    return sendOk(res, req, updated);
  }),
);

router.get(
  '/:id/locales',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    return sendOk(res, req, await localeStats(project.id));
  }),
);

// ── Namespaces ──────────────────────────────────────────────────────

const addNamespaceSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, 'lowercase alphanumeric/underscore/hyphen'),
  reviewPolicy: z.enum(['standard', 'gated']).default('standard'),
});

router.post(
  '/:id/namespaces',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = addNamespaceSchema.parse(req.body ?? {});
    const existing = await prisma.namespace.findUnique({
      where: { projectId_name: { projectId: project.id, name: body.name } },
    });
    if (existing) throw conflict(`namespace "${body.name}" already exists`);
    const ns = await prisma.namespace.create({
      data: { id: newId('ns'), projectId: project.id, name: body.name, reviewPolicy: body.reviewPolicy },
    });
    return sendCreated(res, req, ns);
  }),
);

const patchNamespaceSchema = z.object({
  reviewPolicy: z.enum(['standard', 'gated']),
});

router.patch(
  '/:id/namespaces/:name',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = patchNamespaceSchema.parse(req.body ?? {});
    const ns = await prisma.namespace.findUnique({
      where: { projectId_name: { projectId: project.id, name: pathParam(req, 'name') } },
    });
    if (!ns) throw notFound('namespace not found');
    const updated = await prisma.namespace.update({ where: { id: ns.id }, data: body });
    return sendOk(res, req, updated);
  }),
);

export default router;

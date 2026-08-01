import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, pathParam, notFound, sendList, sendOk } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { encodeCursor, parsePagination } from '../lib/cursor.js';
import { extractPlaceholders } from '../lib/icu.js';
import { ownedProject } from './projects.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

const keyInput = z.object({
  namespace: z.string().default('default'),
  name: z.string().min(1).max(2000),
  sourceText: z.string().max(10_000),
  description: z.string().max(2000).nullable().optional(),
  maxLength: z.number().int().positive().nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});

const upsertSchema = z.object({
  keys: z.array(keyInput).min(1).max(2000),
  /**
   * When true (extract's default), keys of the SAME namespaces that are
   * absent from this payload are archived — extract sends the complete
   * picture of a namespace. push (partial updates) sends prune: false.
   */
  prune: z.boolean().default(false),
});

/**
 * PUT /projects/:id/keys — the extract/push endpoint. Bulk-upserts keys
 * with source text + context; declared ICU placeholders are derived from
 * the source text server-side so the placeholder-safety gate can never
 * disagree with the source of truth.
 */
router.put(
  '/:id/keys',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = upsertSchema.parse(req.body ?? {});

    const nsNames = [...new Set(body.keys.map((k) => k.namespace))];
    const namespaces = await prisma.namespace.findMany({ where: { projectId: project.id } });
    const nsByName = new Map(namespaces.map((n) => [n.name, n]));

    const result = await prisma.$transaction(async (tx) => {
      // Auto-create unseen namespaces (extract discovers them).
      for (const name of nsNames) {
        if (!nsByName.has(name)) {
          const created = await tx.namespace.create({
            data: { id: newId('ns'), projectId: project.id, name },
          });
          nsByName.set(name, created);
        }
      }

      let createdCount = 0;
      let updatedCount = 0;
      const seenByNs = new Map<string, Set<string>>();
      for (const k of body.keys) {
        const ns = nsByName.get(k.namespace)!;
        if (!seenByNs.has(ns.id)) seenByNs.set(ns.id, new Set());
        seenByNs.get(ns.id)!.add(k.name);
        const placeholders = extractPlaceholders(k.sourceText).map((p) => p.name);
        const existing = await tx.key.findUnique({
          where: {
            projectId_namespaceId_name: {
              projectId: project.id,
              namespaceId: ns.id,
              name: k.name,
            },
          },
        });
        if (existing) {
          await tx.key.update({
            where: { id: existing.id },
            data: {
              sourceText: k.sourceText,
              description: k.description !== undefined ? k.description : existing.description,
              maxLength: k.maxLength !== undefined ? k.maxLength : existing.maxLength,
              context: (k.context ?? existing.context) as object,
              placeholders,
              archived: false,
            },
          });
          updatedCount += 1;
        } else {
          await tx.key.create({
            data: {
              id: newId('key'),
              projectId: project.id,
              namespaceId: ns.id,
              name: k.name,
              sourceText: k.sourceText,
              description: k.description ?? null,
              maxLength: k.maxLength ?? null,
              context: (k.context ?? {}) as object,
              placeholders,
            },
          });
          createdCount += 1;
        }
      }

      let archivedCount = 0;
      if (body.prune) {
        for (const [nsId, seen] of seenByNs) {
          const stale = await tx.key.findMany({
            where: { projectId: project.id, namespaceId: nsId, archived: false },
            select: { id: true, name: true },
          });
          const toArchive = stale.filter((s) => !seen.has(s.name)).map((s) => s.id);
          if (toArchive.length > 0) {
            await tx.key.updateMany({ where: { id: { in: toArchive } }, data: { archived: true } });
            archivedCount += toArchive.length;
          }
        }
      }
      return { created: createdCount, updated: updatedCount, archived: archivedCount };
    });

    return sendOk(res, req, result);
  }),
);

/**
 * GET /projects/:id/keys — the workbench list. Filters: namespace,
 * q (substring on name/sourceText), locale+status (translation state
 * for a locale, status=missing means no row).
 */
router.get(
  '/:id/keys',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : undefined;
    const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const includeArchived = req.query.archived === 'true';

    const where = {
      projectId: project.id,
      ...(includeArchived ? {} : { archived: false }),
      ...(namespace ? { namespace: { name: namespace } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { sourceText: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(locale && status
        ? status === 'missing'
          ? { translations: { none: { locale } } }
          : { translations: { some: { locale, status } } }
        : {}),
      ...(cursor
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: new Date(cursor.createdAt) } },
                  { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : {}),
    };

    const rows = await prisma.key.findMany({
      where,
      include: {
        namespace: { select: { name: true, reviewPolicy: true } },
        translations: locale ? { where: { locale } } : true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const next =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return sendList(res, req, page, next, hasMore);
  }),
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, conflict, notFound, sendCreated, sendList, sendOk } from '../lib/http.js';
import { pathParam } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

const termSchema = z.object({
  term: z.string().min(1).max(200),
  /** null = account-wide (applies to every project). */
  projectId: z.string().nullable().optional(),
  /** locale + translation set → forced translation; both null → do-not-translate. */
  locale: z.string().nullable().optional(),
  translation: z.string().max(500).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

router.post(
  '/',
  h(async (req, res) => {
    const body = termSchema.parse(req.body ?? {});
    if (body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: body.projectId } });
      if (!project || project.accountId !== accountId(req)) throw notFound('project not found');
    }
    if (body.translation && !body.locale) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'a forced translation needs a locale', 'locale');
    }
    const existing = await prisma.glossaryTerm.findFirst({
      where: {
        accountId: accountId(req),
        projectId: body.projectId ?? null,
        term: body.term,
        locale: body.locale ?? null,
      },
    });
    if (existing) throw conflict(`glossary term "${body.term}" already exists for this scope`);
    const row = await prisma.glossaryTerm.create({
      data: {
        id: newId('gls'),
        accountId: accountId(req),
        projectId: body.projectId ?? null,
        term: body.term,
        locale: body.locale ?? null,
        translation: body.translation ?? null,
        note: body.note ?? null,
      },
    });
    return sendCreated(res, req, row);
  }),
);

router.get(
  '/',
  h(async (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
    const rows = await prisma.glossaryTerm.findMany({
      where: {
        accountId: accountId(req),
        ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
      },
      orderBy: { term: 'asc' },
      take: 500,
    });
    return sendList(res, req, rows, null, false);
  }),
);

router.delete(
  '/:id',
  h(async (req, res) => {
    const row = await prisma.glossaryTerm.findUnique({ where: { id: pathParam(req, 'id') } });
    if (!row || row.accountId !== accountId(req)) throw notFound('glossary term not found');
    await prisma.glossaryTerm.delete({ where: { id: row.id } });
    return sendOk(res, req, { deleted: true });
  }),
);

export default router;

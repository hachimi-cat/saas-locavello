import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, conflict, notFound, sendCreated, sendList, sendOk } from '../lib/http.js';
import { pathParam } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { recordAudit, actorOf } from '../lib/audit.js';
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
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'glossary_term.created',
      target: { type: 'glossary_term', id: row.id },
      summary: `Added glossary term "${row.term}"${row.locale ? ` (${row.locale})` : ' (do-not-translate)'}`,
      metadata: { term: row.term, locale: row.locale, projectId: row.projectId },
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

/**
 * Every field is optional here — this is a partial edit, and the agentic
 * sheet sends only what changed.
 *
 * `.strict()` because the catentio profile declares exactly these five
 * keys as editable; an undeclared key arriving means the profile and this
 * route have drifted, and silently dropping it is how an agent comes to
 * believe it wrote something it did not.
 */
const patchTermSchema = termSchema.partial().strict();

router.patch(
  '/:id',
  h(async (req, res) => {
    const row = await prisma.glossaryTerm.findUnique({ where: { id: pathParam(req, 'id') } });
    if (!row || row.accountId !== accountId(req)) throw notFound('glossary term not found');
    const body = patchTermSchema.parse(req.body ?? {});

    if (body.projectId) {
      const project = await prisma.project.findUnique({ where: { id: body.projectId } });
      if (!project || project.accountId !== accountId(req)) throw notFound('project not found');
    }

    // Validate the RESULT, not the patch. `translation` and `locale` are
    // separately optional, so either one alone can create the invalid
    // pair: setting a translation on a row whose locale is null, or
    // nulling the locale of a row that already carries a translation.
    // Checking only `body` passes both.
    const next = {
      term: body.term ?? row.term,
      projectId: body.projectId === undefined ? row.projectId : (body.projectId ?? null),
      locale: body.locale === undefined ? row.locale : (body.locale ?? null),
      translation: body.translation === undefined ? row.translation : (body.translation ?? null),
      note: body.note === undefined ? row.note : (body.note ?? null),
    };
    if (next.translation && !next.locale) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'a forced translation needs a locale', 'locale');
    }

    // Same uniqueness rule POST enforces (account + project + term +
    // locale), excluding this row — without the exclusion, saving a term
    // without changing its scope conflicts with itself.
    const clash = await prisma.glossaryTerm.findFirst({
      where: {
        accountId: accountId(req),
        projectId: next.projectId,
        term: next.term,
        locale: next.locale,
        id: { not: row.id },
      },
    });
    if (clash) throw conflict(`glossary term "${next.term}" already exists for this scope`);

    const updated = await prisma.glossaryTerm.update({ where: { id: row.id }, data: next });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'glossary_term.updated',
      target: { type: 'glossary_term', id: updated.id },
      summary: `Updated glossary term "${updated.term}"${updated.locale ? ` (${updated.locale})` : ' (do-not-translate)'}`,
      metadata: { changed: Object.keys(body), term: updated.term, locale: updated.locale, projectId: updated.projectId },
    });
    return sendOk(res, req, updated);
  }),
);

router.delete(
  '/:id',
  h(async (req, res) => {
    const row = await prisma.glossaryTerm.findUnique({ where: { id: pathParam(req, 'id') } });
    if (!row || row.accountId !== accountId(req)) throw notFound('glossary term not found');
    await prisma.glossaryTerm.delete({ where: { id: row.id } });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'glossary_term.deleted',
      target: { type: 'glossary_term', id: row.id },
      summary: `Removed glossary term "${row.term}"`,
      metadata: { term: row.term, locale: row.locale, projectId: row.projectId },
    });
    return sendOk(res, req, { deleted: true });
  }),
);

export default router;

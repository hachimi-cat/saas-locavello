import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, notFound, pathParam, sendCreated, sendList, sendOk } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { countWords } from '../lib/icu.js';
import { ownedProject } from './projects.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

const translateSchema = z.object({
  locale: z.string().min(2),
});

/**
 * POST /projects/:id/translate — queue a machine first pass for a
 * locale. Returns the job immediately with an upfront word ESTIMATE
 * (untranslated source words) so the cost is visible before the run —
 * the worker refines stats as it goes.
 */
router.post(
  '/:id/translate',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const body = translateSchema.parse(req.body ?? {});
    const localeRow = await prisma.projectLocale.findUnique({
      where: { projectId_tag: { projectId: project.id, tag: body.locale } },
    });
    if (!localeRow) throw notFound(`locale "${body.locale}" not enabled for this project`);

    const existing = await prisma.translationJob.findFirst({
      where: { projectId: project.id, locale: body.locale, status: { in: ['queued', 'running'] } },
    });
    if (existing) return sendOk(res, req, { ...existing, alreadyQueued: true });

    const pending = await prisma.key.findMany({
      where: {
        projectId: project.id,
        archived: false,
        OR: [
          { translations: { none: { locale: body.locale } } },
          { translations: { some: { locale: body.locale, status: 'rejected' } } },
        ],
      },
      select: { sourceText: true },
    });
    const estimatedWords = pending.reduce((acc, k) => acc + countWords(k.sourceText), 0);

    const job = await prisma.translationJob.create({
      data: {
        id: newId('tj'),
        accountId: accountId(req),
        projectId: project.id,
        locale: body.locale,
        kind: 'machine_pass',
        status: 'queued',
        stats: { estimatedKeys: pending.length, estimatedWords },
        requestedBy: req.auth?.sub ?? null,
      },
    });
    return sendCreated(res, req, job);
  }),
);

router.get(
  '/:id/jobs',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const rows = await prisma.translationJob.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return sendList(res, req, rows, null, false);
  }),
);

router.get(
  '/jobs/:jobId',
  h(async (req, res) => {
    const job = await prisma.translationJob.findUnique({ where: { id: pathParam(req, 'jobId') } });
    if (!job || job.accountId !== accountId(req)) throw notFound('job not found');
    return sendOk(res, req, job);
  }),
);

export default router;

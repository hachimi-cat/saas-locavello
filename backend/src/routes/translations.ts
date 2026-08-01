import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, pathParam, notFound, sendList, sendOk } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import { encodeCursor, parsePagination } from '../lib/cursor.js';
import { checkPlaceholders, countWords, estimateDisplayLength } from '../lib/icu.js';
import { tmSourceHash } from '../lib/catalog.js';
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

async function ownedKey(req: Request, keyId: string) {
  const key = await prisma.key.findUnique({
    where: { id: keyId },
    include: {
      project: { select: { id: true, accountId: true, sourceLocale: true } },
      namespace: { select: { name: true, reviewPolicy: true } },
    },
  });
  if (!key || key.project.accountId !== accountId(req)) throw notFound('key not found');
  return key;
}

const patchKeySchema = z.object({
  description: z.string().max(2000).nullable().optional(),
  maxLength: z.number().int().positive().nullable().optional(),
  screenshotUrl: z.string().url().max(1000).nullable().optional(),
});

/** PATCH /keys/:keyId — context metadata edits from the workbench. */
router.patch(
  '/keys/:keyId',
  h(async (req, res) => {
    const key = await ownedKey(req, pathParam(req, 'keyId'));
    const body = patchKeySchema.parse(req.body ?? {});
    const updated = await prisma.key.update({ where: { id: key.id }, data: body });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'key.updated',
      target: { type: 'key', id: key.id },
      summary: `Updated context metadata on key "${key.name}"`,
      metadata: { name: key.name, projectId: key.project.id, changed: Object.keys(body) },
    });
    return sendOk(res, req, updated);
  }),
);

const setTranslationSchema = z.object({
  value: z.string().max(20_000),
  /**
   * 'needs_review' (default for human edits), 'machine' (agent first
   * pass), or 'approved' (reviewer editing + approving in one step).
   */
  status: z.enum(['machine', 'needs_review', 'approved']).default('needs_review'),
  author: z.string().max(200).optional(),
});

/**
 * PUT /keys/:keyId/translations/:locale — write a translation. The
 * placeholder-safety gate is enforced HERE, mechanically, on every
 * write: a translation that drops or renames an ICU placeholder never
 * enters the database.
 */
router.put(
  '/keys/:keyId/translations/:locale',
  h(async (req, res) => {
    const key = await ownedKey(req, pathParam(req, 'keyId'));
    const locale = pathParam(req, 'locale');
    const body = setTranslationSchema.parse(req.body ?? {});

    const localeRow = await prisma.projectLocale.findUnique({
      where: { projectId_tag: { projectId: key.project.id, tag: locale } },
    });
    if (!localeRow) throw notFound(`locale "${locale}" not enabled for this project`);

    const check = checkPlaceholders(key.sourceText, body.value);
    if (!check.ok) {
      throw new ApiError(
        422,
        'PLACEHOLDER_MISMATCH',
        `translation must use exactly the source placeholders (missing: [${check.missing.join(', ')}], extra: [${check.extra.join(', ')}])`,
        'value',
      );
    }

    // Gated namespaces never accept machine output as terminal state —
    // an agent write lands as needs_review at best.
    let status = body.status;
    if (key.namespace.reviewPolicy === 'gated' && status === 'machine') {
      status = 'needs_review';
    }

    const author = body.author ?? req.auth?.sub ?? null;
    const translation = await prisma.$transaction(async (tx) => {
      const row = await tx.translation.upsert({
        where: { keyId_locale: { keyId: key.id, locale } },
        create: {
          id: newId('tr'),
          keyId: key.id,
          locale,
          value: body.value,
          status,
          author,
          wordCount: countWords(key.sourceText),
          ...(status === 'approved' ? { reviewedBy: req.auth?.sub ?? null } : {}),
        },
        update: {
          value: body.value,
          status,
          author,
          rejectedReason: null,
          ...(status === 'approved' ? { reviewedBy: req.auth?.sub ?? null } : {}),
        },
      });
      if (status === 'approved') {
        await upsertTm(tx, req, key, locale, body.value, 'approved');
      }
      return row;
    });

    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'translation.updated',
      target: { type: 'translation', id: translation.id },
      summary: `Wrote the ${locale} translation of key "${key.name}" (${status})`,
      metadata: { keyId: key.id, locale, status, projectId: key.project.id },
    });
    const lengthWarning =
      key.maxLength && estimateDisplayLength(body.value) > key.maxLength
        ? { maxLength: key.maxLength, estimated: estimateDisplayLength(body.value) }
        : null;
    return sendOk(res, req, { ...translation, lengthWarning });
  }),
);

type TxLike = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function upsertTm(
  tx: TxLike,
  req: Request,
  key: { sourceText: string; project: { id: string; sourceLocale: string } },
  targetLocale: string,
  targetText: string,
  quality: 'approved' | 'machine',
) {
  const sourceHash = tmSourceHash(key.sourceText);
  const existing = await tx.tmEntry.findFirst({
    where: { accountId: accountId(req), sourceHash, targetLocale },
  });
  if (existing) {
    // Approved beats machine; newer approved beats older approved.
    if (quality === 'approved' || existing.quality === 'machine') {
      await tx.tmEntry.update({
        where: { id: existing.id },
        data: { targetText, quality },
      });
    }
    return;
  }
  await tx.tmEntry.create({
    data: {
      id: newId('tm'),
      accountId: accountId(req),
      projectId: key.project.id,
      sourceLocale: key.project.sourceLocale,
      targetLocale,
      sourceText: key.sourceText,
      sourceHash,
      targetText,
      quality,
    },
  });
}

/**
 * GET /projects/:id/review-queue — everything machine-produced or
 * flagged, with the key context the reviewer needs, oldest first.
 */
router.get(
  '/projects/:id/review-queue',
  h(async (req, res) => {
    const project = await ownedProject(req, pathParam(req, 'id'));
    const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);
    const locale = typeof req.query.locale === 'string' ? req.query.locale : undefined;

    const rows = await prisma.translation.findMany({
      where: {
        key: { projectId: project.id, archived: false },
        status: { in: ['machine', 'needs_review'] },
        ...(locale ? { locale } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { gt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      include: {
        key: {
          select: {
            id: true,
            name: true,
            sourceText: true,
            description: true,
            screenshotUrl: true,
            maxLength: true,
            placeholders: true,
            context: true,
            namespace: { select: { name: true, reviewPolicy: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

async function ownedTranslation(req: Request, id: string) {
  const tr = await prisma.translation.findUnique({
    where: { id },
    include: {
      key: {
        include: {
          project: { select: { id: true, accountId: true, sourceLocale: true } },
          namespace: { select: { reviewPolicy: true } },
        },
      },
    },
  });
  if (!tr || tr.key.project.accountId !== accountId(req)) throw notFound('translation not found');
  return tr;
}

router.post(
  '/translations/:id/approve',
  h(async (req, res) => {
    const tr = await ownedTranslation(req, pathParam(req, 'id'));
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.translation.update({
        where: { id: tr.id },
        data: { status: 'approved', reviewedBy: req.auth?.sub ?? null, rejectedReason: null },
      });
      await upsertTm(tx, req, tr.key, tr.locale, tr.value, 'approved');
      await writeOutbox(tx, {
        type: 'locavello.translation.approved.v1',
        accountId: tr.key.project.accountId,
        aggregateId: tr.key.project.id,
        data: { translationId: tr.id, keyId: tr.keyId, locale: tr.locale },
      });
      return row;
    });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'translation.approved',
      target: { type: 'translation', id: tr.id },
      summary: `Approved the ${tr.locale} translation of key "${tr.key.name}"`,
      metadata: { keyId: tr.keyId, locale: tr.locale, projectId: tr.key.project.id },
    });
    return sendOk(res, req, updated);
  }),
);

const rejectSchema = z.object({
  reason: z.string().min(1).max(2000),
});

router.post(
  '/translations/:id/reject',
  h(async (req, res) => {
    const tr = await ownedTranslation(req, pathParam(req, 'id'));
    const body = rejectSchema.parse(req.body ?? {});
    const updated = await prisma.translation.update({
      where: { id: tr.id },
      data: { status: 'rejected', reviewedBy: req.auth?.sub ?? null, rejectedReason: body.reason },
    });
    await recordAudit(prisma, {
      accountId: accountId(req),
      actor: actorOf(req),
      action: 'translation.rejected',
      target: { type: 'translation', id: tr.id },
      summary: `Rejected the ${tr.locale} translation of key "${tr.key.name}"`,
      metadata: { keyId: tr.keyId, locale: tr.locale, projectId: tr.key.project.id },
    });
    return sendOk(res, req, updated);
  }),
);

export default router;

import { Router } from 'express';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, sendList, sendOk } from '../lib/http.js';
import { tmSourceHash } from '../lib/catalog.js';
import { encodeCursor, parsePagination } from '../lib/cursor.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

/**
 * GET /tm/suggest?text=&target= — workbench + agent suggestions.
 * Exact match first (sourceHash), then substring candidates. The
 * cross-project reuse this enables is the compounding asset the whole
 * product is built around.
 */
router.get(
  '/suggest',
  h(async (req, res) => {
    const text = typeof req.query.text === 'string' ? req.query.text : '';
    const target = typeof req.query.target === 'string' ? req.query.target : '';
    if (!text || !target) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'text and target are required');
    }
    const exact = await prisma.tmEntry.findFirst({
      where: { accountId: accountId(req), sourceHash: tmSourceHash(text), targetLocale: target },
      orderBy: { updatedAt: 'desc' },
    });
    const fuzzy = await prisma.tmEntry.findMany({
      where: {
        accountId: accountId(req),
        targetLocale: target,
        sourceText: { contains: text.slice(0, 60), mode: 'insensitive' },
        ...(exact ? { id: { not: exact.id } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    });
    return sendOk(res, req, { exact, fuzzy });
  }),
);

/**
 * GET /tm — browse the whole memory, newest-first, cursor-paged. The
 * TM screen lists this on load (742 entries must not hide behind a
 * search box); `target` narrows to one locale.
 */
router.get(
  '/',
  h(async (req, res) => {
    const target = typeof req.query.target === 'string' && req.query.target ? req.query.target : undefined;
    const { limit, cursor } = parsePagination(req.query as Record<string, unknown>);

    const rows = await prisma.tmEntry.findMany({
      where: {
        accountId: accountId(req),
        ...(target ? { targetLocale: target } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const next =
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null;
    return sendList(res, req, page, next, hasMore);
  }),
);

/** GET /tm/search?q=&target= — the TM screen's cross-project search. */
router.get(
  '/search',
  h(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const target = typeof req.query.target === 'string' ? req.query.target : undefined;
    if (!q) throw new ApiError(422, 'VALIDATION_ERROR', 'q is required');
    const rows = await prisma.tmEntry.findMany({
      where: {
        accountId: accountId(req),
        ...(target ? { targetLocale: target } : {}),
        OR: [
          { sourceText: { contains: q, mode: 'insensitive' } },
          { targetText: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return sendList(res, req, rows, null, false);
  }),
);

export default router;

import { Router } from 'express';
import type { Request } from 'express';
import type { AuditEvent } from '@prisma/client';
import { prisma } from '../lib/db.js';
import { ApiError, sendList } from '../lib/http.js';
import { h } from '../lib/async-handler.js';
import { parsePagination, encodeCursor } from '../lib/cursor.js';

/**
 * Workspace audit log (the depllo pattern):
 *
 *   GET /api/v1/audit            cursor-paginated, newest first
 *     ?action=release.published  exact action filter
 *     ?actor=usr_x               matches actorSub exactly OR actorLabel (contains)
 *     ?q=deleted staging         free text over summary/action/targetId (contains)
 *     ?cursor=&limit=            family cursor pagination
 *
 * Auth is mounted in routes/index.ts (requireAuthOrApiKey, like every
 * engine surface). Rows are written by lib/audit.ts `recordAudit` —
 * append-only, never mutated, so this surface is read-only by
 * construction.
 */

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

function auditView(e: AuditEvent) {
  return {
    id: e.id,
    actorSub: e.actorSub,
    actorLabel: e.actorLabel,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    summary: e.summary,
    metadata: e.metadata,
    createdAt: e.createdAt,
  };
}

router.get(
  '/',
  h(async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const { limit, cursor } = parsePagination(q);

    const filters: Record<string, unknown>[] = [{ accountId: accountId(req) }];
    if (typeof q.action === 'string' && q.action) filters.push({ action: q.action });
    if (typeof q.actor === 'string' && q.actor) {
      filters.push({
        OR: [
          { actorSub: q.actor },
          { actorLabel: { contains: q.actor, mode: 'insensitive' as const } },
        ],
      });
    }
    if (typeof q.q === 'string' && q.q.trim()) {
      const text = q.q.trim();
      filters.push({
        OR: [
          { summary: { contains: text, mode: 'insensitive' as const } },
          { action: { contains: text, mode: 'insensitive' as const } },
          { targetId: text },
        ],
      });
    }
    if (cursor) {
      filters.push({
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await prisma.auditEvent.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null;
    return sendList(res, req, page.map(auditView), nextCursor, hasMore);
  }),
);

export default router;

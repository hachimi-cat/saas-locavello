import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { h } from '../lib/async-handler.js';
import { ApiError, notFound, sendCreated, sendList, sendOk } from '../lib/http.js';
import { pathParam } from '../lib/http.js';
import { newId } from '../lib/ids.js';
import type { Request } from 'express';

const router = Router();

function accountId(req: Request): string {
  const id = req.auth?.accountId;
  if (!id) throw new ApiError(401, 'AUTH_REQUIRED', 'no account in auth context');
  return id;
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
});

/**
 * POST /api-keys — mint `lv_live_…`. The plaintext is returned ONCE and
 * stored only as a sha256 hash; the prefix column powers "lv_live_ab…"
 * display.
 */
router.post(
  '/',
  h(async (req, res) => {
    const body = createSchema.parse(req.body ?? {});
    const plaintext = `lv_live_${randomBytes(24).toString('hex')}`;
    const row = await prisma.apiKey.create({
      data: {
        id: newId('ak'),
        accountId: accountId(req),
        name: body.name,
        keyHash: createHash('sha256').update(plaintext).digest('hex'),
        prefix: plaintext.slice(0, 12),
        createdBy: req.auth?.sub ?? null,
      },
    });
    return sendCreated(res, req, { ...row, keyHash: undefined, plaintext });
  }),
);

router.get(
  '/',
  h(async (req, res) => {
    const rows = await prisma.apiKey.findMany({
      where: { accountId: accountId(req) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
    return sendList(res, req, rows, null, false);
  }),
);

router.delete(
  '/:id',
  h(async (req, res) => {
    const row = await prisma.apiKey.findUnique({ where: { id: pathParam(req, 'id') } });
    if (!row || row.accountId !== accountId(req)) throw notFound('API key not found');
    const updated = await prisma.apiKey.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });
    return sendOk(res, req, { id: updated.id, revokedAt: updated.revokedAt });
  }),
);

export default router;

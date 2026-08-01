import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/db.js';
import { sendErr } from '../lib/http.js';
import { requireAuth } from './auth.js';
import type { ForjioClaims } from '@forjio/sdk/auth';

/**
 * CLI/SDK auth path: `Authorization: Bearer lv_live_…` developer API
 * keys, sha256-hashed at rest. Anything that is not an lv_ key falls
 * through to the normal requireAuth (BFF cookie or Huudis JWT), so one
 * middleware serves both the portal and the CLI.
 */
export async function requireAuthOrApiKey(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  if (token?.startsWith('lv_')) {
    const keyHash = createHash('sha256').update(token).digest('hex');
    const key = await prisma.apiKey.findUnique({ where: { keyHash } });
    if (!key || key.revokedAt) {
      return sendErr(res, req, 401, 'INVALID_API_KEY', 'unknown or revoked API key');
    }
    // Throttled last-used stamp (≤ 1/min per key) — display data, not audit.
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
      prisma.apiKey
        .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
    }
    req.auth = {
      sub: `apikey:${key.id}`,
      accountId: key.accountId,
      scope: 'locavello:cli',
      iss: 'locavello',
      aud: 'locavello',
      exp: Math.floor(Date.now() / 1000) + 900,
      iat: Math.floor(Date.now() / 1000),
    } as unknown as ForjioClaims;
    return next();
  }
  return requireAuth(req, res, next);
}

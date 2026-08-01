import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/*
 * GET /tm — the browse/list surface. The TM screen lists the whole
 * memory on load (cursor-paged, newest first); search stays a
 * separate narrowing endpoint. Requires DATABASE_URL.
 */

import tmRouter from '../routes/tm.js';
import { zodErrorHandler } from '../middleware/zod-error.js';
import { ApiError, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';
import { tmSourceHash } from '../lib/catalog.js';

const RUN = randomBytes(4).toString('hex');
const ACC = `acc_tmbrowse_${RUN}`;
const OTHER = `acc_tmbrowse_other_${RUN}`;

function makeApp() {
  const app = express();
  app.use(express.json());
  const stubAuth = (req: Request, _res: Response, next: NextFunction) => {
    req.auth = {
      sub: 'usr_test',
      accountId: (req.headers['x-test-account'] as string) ?? ACC,
      scope: '',
      iss: 'test',
      aud: 'test',
      exp: 0,
      iat: 0,
    } as never;
    next();
  };
  app.use('/api/v1/tm', stubAuth, tmRouter);
  app.use(zodErrorHandler);
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) return sendErr(res, req, err.status, err.code, err.message);
    return sendErr(res, req, 500, 'INTERNAL_ERROR', 'boom');
  });
  return app;
}

beforeAll(async () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    id: newId('tm'),
    accountId: i === 6 ? OTHER : ACC,
    projectId: null,
    sourceLocale: 'en',
    targetLocale: i % 2 === 0 ? 'id' : 'ms',
    sourceText: `tm browse source ${RUN} ${i}`,
    sourceHash: tmSourceHash(`tm browse source ${RUN} ${i}`),
    targetText: `terjemahan ${RUN} ${i}`,
    quality: 'approved',
    // Spread createdAt so cursor ordering is deterministic.
    createdAt: new Date(Date.now() - i * 60_000),
  }));
  await prisma.tmEntry.createMany({ data: rows });
});

afterAll(async () => {
  await prisma.tmEntry.deleteMany({ where: { accountId: { in: [ACC, OTHER] } } });
  await prisma.$disconnect();
});

describe('GET /tm (browse)', () => {
  it('lists the account memory newest-first without requiring q', async () => {
    const res = await request(makeApp()).get('/api/v1/tm');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(6); // OTHER's row is scoped out
    const times = res.body.data.map((r: { createdAt: string }) => Date.parse(r.createdAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('pages with cursor + hasMore and never repeats rows', async () => {
    const app = makeApp();
    const first = await request(app).get('/api/v1/tm?limit=4');
    expect(first.status).toBe(200);
    expect(first.body.data.length).toBe(4);
    expect(first.body.meta.hasMore).toBe(true);
    expect(first.body.meta.cursor).toBeTruthy();

    const second = await request(app).get(
      `/api/v1/tm?limit=4&cursor=${encodeURIComponent(first.body.meta.cursor)}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.data.length).toBe(2);
    expect(second.body.meta.hasMore).toBe(false);
    const ids = new Set([
      ...first.body.data.map((r: { id: string }) => r.id),
      ...second.body.data.map((r: { id: string }) => r.id),
    ]);
    expect(ids.size).toBe(6);
  });

  it('narrows by target locale', async () => {
    const res = await request(makeApp()).get('/api/v1/tm?target=ms');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
    for (const r of res.body.data) expect(r.targetLocale).toBe('ms');
  });
});

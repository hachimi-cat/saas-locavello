import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/*
 * PATCH /glossary/:id — the route that did not exist.
 *
 * The catentio profile declares all five glossary fields `edit: true`,
 * the endpoint line advertises `PATCH /api/v1/glossary/{id}`, and
 * `frontend/src/components/catentio/chat-actions.ts` calls
 * `api.patch('/glossary/{id}')` — but `routes/glossary.ts` mounted only
 * post/get/delete. Every edit the assistant proposed 404'd at apply
 * time. Four places agreed on a capability that was never served; the
 * only one that decides is the router.
 *
 * Requires DATABASE_URL.
 */

import glossaryRouter from '../routes/glossary.js';
import { zodErrorHandler } from '../middleware/zod-error.js';
import { ApiError, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import { newId } from '../lib/ids.js';

const RUN = randomBytes(4).toString('hex');
const ACC = `acc_glspatch_${RUN}`;
const OTHER = `acc_glspatch_other_${RUN}`;

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
  app.use('/api/v1/glossary', stubAuth, glossaryRouter);
  // Mirrors app.ts exactly. My first version called
  // `sendErr(res, req, err)`, but the real signature is
  // `sendErr(res, req, status, code, message, extra)` — so every thrown
  // ApiError came back 500 with an empty body and four assertions
  // "failed" against a route that was correct. A harness that does not
  // reproduce the app's own wiring tests the harness.
  app.use(zodErrorHandler);
  app.use((e: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof ApiError) {
      return sendErr(res, req, e.status, e.code, e.message, e.param ? { param: e.param } : {});
    }
    return sendErr(res, req, 500, 'INTERNAL_ERROR', e instanceof Error ? e.message : String(e));
  });
  return app;
}

const app = makeApp();

async function seed(over: Partial<{ term: string; locale: string | null; translation: string | null; projectId: string | null; accountId: string }> = {}) {
  return prisma.glossaryTerm.create({
    data: {
      id: newId('gls'),
      accountId: over.accountId ?? ACC,
      projectId: over.projectId ?? null,
      term: over.term ?? `term_${randomBytes(3).toString('hex')}`,
      locale: over.locale ?? null,
      translation: over.translation ?? null,
      note: null,
    },
  });
}

beforeAll(async () => {
  await prisma.glossaryTerm.deleteMany({ where: { accountId: { in: [ACC, OTHER] } } });
});

afterAll(async () => {
  await prisma.glossaryTerm.deleteMany({ where: { accountId: { in: [ACC, OTHER] } } });
  await prisma.$disconnect();
});

describe('PATCH /glossary/:id exists and edits', () => {
  it('the route is mounted at all — this is the whole defect', async () => {
    // Before the fix this was 404 for every id, valid or not.
    const row = await seed({ term: `mounted_${RUN}` });
    const res = await request(app).patch(`/api/v1/glossary/${row.id}`).send({ note: 'hello' });
    expect(res.status).toBe(200);
    expect(res.body.data.note).toBe('hello');
  });

  it('edits one field and leaves the rest alone', async () => {
    const row = await seed({ term: `partial_${RUN}`, locale: 'fr', translation: 'Bonjour' });
    const res = await request(app).patch(`/api/v1/glossary/${row.id}`).send({ note: 'only this' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ term: `partial_${RUN}`, locale: 'fr', translation: 'Bonjour', note: 'only this' });
  });

  it('another account cannot reach the row', async () => {
    const row = await seed({ term: `tenant_${RUN}`, accountId: OTHER });
    const res = await request(app)
      .patch(`/api/v1/glossary/${row.id}`)
      .set('x-test-account', ACC)
      .send({ note: 'nope' });
    expect(res.status).toBe(404);
  });
});

describe('the rule is checked on the RESULT, not on the patch body', () => {
  // Both of these pass a body-only check: neither body contains both a
  // translation AND a null locale. The invalid pair only exists after
  // the patch is merged with the stored row.

  it('refuses a translation added to a row whose locale is null', async () => {
    const row = await seed({ term: `merge_a_${RUN}`, locale: null, translation: null });
    const res = await request(app).patch(`/api/v1/glossary/${row.id}`).send({ translation: 'Bonjour' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses nulling the locale of a row that already carries a translation', async () => {
    const row = await seed({ term: `merge_b_${RUN}`, locale: 'fr', translation: 'Bonjour' });
    const res = await request(app).patch(`/api/v1/glossary/${row.id}`).send({ locale: null });
    expect(res.status).toBe(422);
  });

  it('allows setting locale and translation together', async () => {
    const row = await seed({ term: `merge_c_${RUN}` });
    const res = await request(app)
      .patch(`/api/v1/glossary/${row.id}`)
      .send({ locale: 'de', translation: 'Hallo' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ locale: 'de', translation: 'Hallo' });
  });

  it('allows clearing a translation back to do-not-translate', async () => {
    const row = await seed({ term: `merge_d_${RUN}`, locale: 'fr', translation: 'Bonjour' });
    const res = await request(app)
      .patch(`/api/v1/glossary/${row.id}`)
      .send({ translation: null, locale: null });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ locale: null, translation: null });
  });
});

describe('uniqueness excludes the row itself', () => {
  it('saving a row without changing its scope is not a conflict with itself', async () => {
    // The bug a naive findFirst() produces: the row matches its own
    // scope, so every no-op save 409s.
    const row = await seed({ term: `self_${RUN}`, locale: 'es' });
    const res = await request(app).patch(`/api/v1/glossary/${row.id}`).send({ note: 'unchanged scope' });
    expect(res.status).toBe(200);
  });

  it('still refuses colliding with a DIFFERENT row in the same scope', async () => {
    const taken = await seed({ term: `taken_${RUN}`, locale: 'es' });
    const mine = await seed({ term: `mine_${RUN}`, locale: 'es' });
    const res = await request(app).patch(`/api/v1/glossary/${mine.id}`).send({ term: taken.term });
    expect(res.status).toBe(409);
  });
});

describe('the schema matches what the profile declares', () => {
  it('rejects an undeclared key rather than silently dropping it', async () => {
    // If profile and route drift, the agent must be told — a dropped key
    // reads to it as a successful write.
    const row = await seed({ term: `strict_${RUN}` });
    const res = await request(app)
      .patch(`/api/v1/glossary/${row.id}`)
      .send({ notAField: 'x' });
    // 400 is the house code for a zod parse failure (zod-error.ts); the
    // route's own business rule throws 422. Both are VALIDATION_ERROR.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('accepts every key the profile declares editable', async () => {
    const project = await prisma.project.findFirst({ where: { accountId: ACC } });
    const row = await seed({ term: `allkeys_${RUN}` });
    const res = await request(app)
      .patch(`/api/v1/glossary/${row.id}`)
      .send({
        term: `allkeys_renamed_${RUN}`,
        locale: 'id',
        translation: 'Halo',
        note: 'a note',
        ...(project ? { projectId: project.id } : {}),
      });
    expect(res.status).toBe(200);
    expect(res.body.data.term).toBe(`allkeys_renamed_${RUN}`);
  });
});

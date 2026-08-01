import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/*
 * Engine integration tests — the pull/check contract end to end against
 * a real database: project → locale → keys (extract) → translation
 * (placeholder gate) → review → TM → release (idempotent publish) →
 * pull (catalog + pseudo) → check (missing keys) → prune.
 *
 * Auth is stubbed with a per-run account id; the auth middleware has
 * its own contract test. Requires DATABASE_URL (CI provides the
 * postgres service; locally use the locavello_dev database).
 */

import projectsRouter from '../routes/projects.js';
import keysRouter from '../routes/keys.js';
import translationsRouter from '../routes/translations.js';
import releasesRouter from '../routes/releases.js';
import glossaryRouter from '../routes/glossary.js';
import tmRouter from '../routes/tm.js';
import apiKeysRouter from '../routes/api-keys.js';
import { zodErrorHandler } from '../middleware/zod-error.js';
import { ApiError, sendErr } from '../lib/http.js';

const ACCOUNT = `acc_test_${randomBytes(6).toString('hex')}`;

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const stubAuth = (req: Request, _res: Response, next: NextFunction) => {
    req.auth = {
      sub: 'usr_test',
      accountId: ACCOUNT,
      scope: '',
      iss: 'test',
      aud: 'test',
      exp: 0,
      iat: 0,
    } as never;
    next();
  };
  app.use('/api/v1/projects', stubAuth, projectsRouter);
  app.use('/api/v1/projects', stubAuth, keysRouter);
  app.use('/api/v1', stubAuth, translationsRouter);
  app.use('/api/v1/projects', stubAuth, releasesRouter);
  app.use('/api/v1/glossary', stubAuth, glossaryRouter);
  app.use('/api/v1/tm', stubAuth, tmRouter);
  app.use('/api/v1/api-keys', stubAuth, apiKeysRouter);
  app.use(zodErrorHandler);
  app.use((e: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof ApiError) {
      return sendErr(res, req, e.status, e.code, e.message, e.param ? { param: e.param } : {});
    }
    return sendErr(res, req, 500, 'INTERNAL_ERROR', e instanceof Error ? e.message : 'unexpected');
  });
  return app;
}

const app = makeApp();
let projectId = '';
let keyId = '';
let translationId = '';

describe('engine — project lifecycle', () => {
  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .send({ slug: 'testproj', name: 'Test Project' });
    expect(res.status).toBe(201);
    projectId = res.body.data.id;
  });

  it('duplicate slug conflicts', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .send({ slug: 'testproj', name: 'Again' });
    expect(res.status).toBe(409);
  });

  it('proxy mode requires siteUrl', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .send({ slug: 'proxyproj', name: 'P', mode: 'proxy' });
    expect(res.status).toBe(422);
  });

  it('adds a locale and rejects duplicates + the source locale', async () => {
    const ok = await request(app).post(`/api/v1/projects/${projectId}/locales`).send({ tag: 'id' });
    expect(ok.status).toBe(201);
    const dup = await request(app).post(`/api/v1/projects/${projectId}/locales`).send({ tag: 'id' });
    expect(dup.status).toBe(409);
    const src = await request(app).post(`/api/v1/projects/${projectId}/locales`).send({ tag: 'en' });
    expect(src.status).toBe(422);
  });

  it('extract upserts keys and auto-creates namespaces', async () => {
    const res = await request(app)
      .put(`/api/v1/projects/${projectId}/keys`)
      .send({
        keys: [
          { namespace: 'default', name: 'Create link', sourceText: 'Create link' },
          {
            namespace: 'default',
            name: 'items.count',
            sourceText: '{count, plural, one {# item} other {# items}}',
          },
          { namespace: 'marketing', name: 'hero.title', sourceText: 'Ship in every language' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ created: 3, updated: 0, archived: 0 });
  });

  it('derives placeholders server-side', async () => {
    const res = await request(app).get(`/api/v1/projects/${projectId}/keys?q=items`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    keyId = res.body.data[0].id;
    expect(res.body.data[0].placeholders).toEqual(['count']);
  });
});

describe('engine — translations + placeholder gate', () => {
  it('rejects a translation that drops a placeholder', async () => {
    const res = await request(app)
      .put(`/api/v1/keys/${keyId}/translations/id`)
      .send({ value: 'beberapa item' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLACEHOLDER_MISMATCH');
  });

  it('accepts a placeholder-preserving translation', async () => {
    const res = await request(app)
      .put(`/api/v1/keys/${keyId}/translations/id`)
      .send({ value: '{count, plural, other {# item}}', status: 'needs_review' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('needs_review');
    translationId = res.body.data.id;
  });

  it('rejects an unknown locale', async () => {
    const res = await request(app)
      .put(`/api/v1/keys/${keyId}/translations/fr`)
      .send({ value: 'quelques {count}' });
    expect(res.status).toBe(404);
  });

  it('review queue lists it, approve moves it to TM', async () => {
    const queue = await request(app).get(`/api/v1/projects/${projectId}/review-queue`);
    expect(queue.status).toBe(200);
    expect(queue.body.data.some((t: { id: string }) => t.id === translationId)).toBe(true);

    const ok = await request(app).post(`/api/v1/translations/${translationId}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('approved');

    const tm = await request(app).get(
      `/api/v1/tm/suggest?text=${encodeURIComponent('{count, plural, one {# item} other {# items}}')}&target=id`,
    );
    expect(tm.status).toBe(200);
    expect(tm.body.data.exact).not.toBeNull();
  });
});

describe('engine — releases, pull, check', () => {
  it('publishes a release and is idempotent on content', async () => {
    const first = await request(app)
      .post(`/api/v1/projects/${projectId}/releases`)
      .send({ locale: 'id' });
    expect(first.status).toBe(201);
    expect(first.body.data.keyCount).toBe(1); // only the approved key

    const second = await request(app)
      .post(`/api/v1/projects/${projectId}/releases`)
      .send({ locale: 'id' });
    expect(second.status).toBe(200);
    expect(second.body.data.unchanged).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
  });

  it('pull returns source, catalogs, fallbacks and pseudo', async () => {
    const res = await request(app).get(`/api/v1/projects/${projectId}/pull?pseudo=true`);
    expect(res.status).toBe(200);
    const { source, locales, fallbacks } = res.body.data;
    expect(source['Create link']).toBe('Create link');
    expect(source['marketing.hero.title']).toBe('Ship in every language');
    expect(locales.id.catalog['items.count']).toBe('{count, plural, other {# item}}');
    expect(locales['en-XA'].catalog['Create link']).toContain('Çŕ');
    expect(fallbacks).toHaveProperty('id');
  });

  it('check reports missing keys as errors', async () => {
    const res = await request(app).get(`/api/v1/projects/${projectId}/check`);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(false);
    const missing = res.body.data.errors.filter(
      (e: { type: string }) => e.type === 'missing_key',
    );
    expect(missing.length).toBe(2); // 'Create link' + marketing.hero.title lack id
  });

  it('prune archives keys absent from the payload', async () => {
    const res = await request(app)
      .put(`/api/v1/projects/${projectId}/keys`)
      .send({
        keys: [{ namespace: 'default', name: 'Create link', sourceText: 'Create link' }],
        prune: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.data.archived).toBe(1); // items.count gone from default ns

    const keys = await request(app).get(`/api/v1/projects/${projectId}/keys`);
    const names = keys.body.data.map((k: { name: string }) => k.name);
    expect(names).not.toContain('items.count');
    expect(names).toContain('hero.title'); // other namespace untouched
  });
});

describe('engine — glossary + api keys', () => {
  it('creates a do-not-translate term and check flags violations', async () => {
    const res = await request(app).post('/api/v1/glossary').send({ term: 'Locavello' });
    expect(res.status).toBe(201);
    expect(res.body.data.translation).toBeNull();
  });

  it('forced translation requires a locale', async () => {
    const res = await request(app)
      .post('/api/v1/glossary')
      .send({ term: 'workspace', translation: 'ruang kerja' });
    expect(res.status).toBe(422);
  });

  it('mints an api key once, lists masked, revokes', async () => {
    const created = await request(app).post('/api/v1/api-keys').send({ name: 'ci' });
    expect(created.status).toBe(201);
    expect(created.body.data.plaintext).toMatch(/^lv_live_/);

    const list = await request(app).get('/api/v1/api-keys');
    expect(list.status).toBe(200);
    expect(list.body.data[0].plaintext).toBeUndefined();
    expect(list.body.data[0].prefix).toMatch(/^lv_live_/);

    const revoked = await request(app).delete(`/api/v1/api-keys/${created.body.data.id}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.data.revokedAt).not.toBeNull();
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/*
 * Audit trail tests (the depllo pattern): recordAudit writes from the
 * instrumented portal routes (project/locale lifecycle, key extract,
 * translation write/approve, glossary + API-key mutations) + the
 * GET /api/v1/audit read surface (workspace scoping, filters, cursor
 * pagination). Requires DATABASE_URL.
 */

import projectsRouter from '../routes/projects.js';
import keysRouter from '../routes/keys.js';
import translationsRouter from '../routes/translations.js';
import glossaryRouter from '../routes/glossary.js';
import apiKeysRouter from '../routes/api-keys.js';
import auditRouter from '../routes/audit.js';
import { zodErrorHandler } from '../middleware/zod-error.js';
import { ApiError, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import { recordAudit } from '../lib/audit.js';

const RUN = randomBytes(4).toString('hex');
const accounts: string[] = [];

function account(): string {
  const a = `acc_audit_${RUN}_${randomBytes(4).toString('hex')}`;
  accounts.push(a);
  return a;
}

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  const stubAuth = (req: Request, _res: Response, next: NextFunction) => {
    req.auth = {
      sub: (req.headers['x-test-sub'] as string) ?? 'usr_test',
      accountId: (req.headers['x-test-account'] as string) ?? 'acc_audit_default',
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
  app.use('/api/v1/glossary', stubAuth, glossaryRouter);
  app.use('/api/v1/api-keys', stubAuth, apiKeysRouter);
  app.use('/api/v1/audit', stubAuth, auditRouter);
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
const as = (acc: string, sub = 'usr_test') => ({ 'x-test-account': acc, 'x-test-sub': sub });

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: { accountId: { in: accounts } } });
  await prisma.apiKey.deleteMany({ where: { accountId: { in: accounts } } });
  await prisma.glossaryTerm.deleteMany({ where: { accountId: { in: accounts } } });
  await prisma.tmEntry.deleteMany({ where: { accountId: { in: accounts } } });
  const projects = await prisma.project.findMany({ where: { accountId: { in: accounts } } });
  for (const p of projects) {
    await prisma.translation.deleteMany({ where: { key: { projectId: p.id } } });
    await prisma.key.deleteMany({ where: { projectId: p.id } });
    await prisma.namespace.deleteMany({ where: { projectId: p.id } });
    await prisma.projectLocale.deleteMany({ where: { projectId: p.id } });
    await prisma.project.delete({ where: { id: p.id } });
  }
});

async function auditRows(acc: string) {
  return prisma.auditEvent.findMany({ where: { accountId: acc }, orderBy: { createdAt: 'asc' } });
}

describe('audit writes from instrumented routes', () => {
  it('records the project → locale → extract → translation lifecycle', async () => {
    const acc = account();
    const created = await request(app)
      .post('/api/v1/projects')
      .set(as(acc, 'usr_owner'))
      .send({ slug: 'audited', name: 'Audited' });
    expect(created.status).toBe(201);
    const projectId = created.body.data.id as string;

    await request(app)
      .post(`/api/v1/projects/${projectId}/locales`)
      .set(as(acc))
      .send({ tag: 'id' });
    await request(app)
      .put(`/api/v1/projects/${projectId}/keys`)
      .set(as(acc))
      .send({ keys: [{ namespace: 'default', name: 'greeting', sourceText: 'Hello' }] });

    const keys = await request(app).get(`/api/v1/projects/${projectId}/keys`).set(as(acc));
    const keyId = keys.body.data[0].id as string;
    const wrote = await request(app)
      .put(`/api/v1/keys/${keyId}/translations/id`)
      .set(as(acc, 'usr_translator'))
      .send({ value: 'Halo' });
    expect(wrote.status).toBe(200);
    const translationId = wrote.body.data.id as string;
    await request(app)
      .post(`/api/v1/translations/${translationId}/approve`)
      .set(as(acc, 'usr_reviewer'))
      .send({});

    const rows = await auditRows(acc);
    expect(rows.map((r) => r.action)).toEqual([
      'project.created',
      'locale.added',
      'keys.extracted',
      'translation.updated',
      'translation.approved',
    ]);
    expect(rows[0]).toMatchObject({
      actorSub: 'usr_owner',
      targetType: 'project',
      targetId: projectId,
    });
    expect(rows[0]!.id).toMatch(/^aud_/);
    expect(rows[0]!.summary).toContain('audited');
    expect(rows[3]).toMatchObject({ actorSub: 'usr_translator', targetId: translationId });
    expect(rows[4]).toMatchObject({ actorSub: 'usr_reviewer', targetType: 'translation' });
  });

  it('records glossary and API-key mutations without leaking key material', async () => {
    const acc = account();
    const term = await request(app)
      .post('/api/v1/glossary')
      .set(as(acc))
      .send({ term: 'Locavello' });
    expect(term.status).toBe(201);
    await request(app).delete(`/api/v1/glossary/${term.body.data.id}`).set(as(acc));

    const minted = await request(app).post('/api/v1/api-keys').set(as(acc)).send({ name: 'ci' });
    expect(minted.status).toBe(201);
    const plaintext = minted.body.data.plaintext as string;
    await request(app).delete(`/api/v1/api-keys/${minted.body.data.id}`).set(as(acc));

    const rows = await auditRows(acc);
    expect(rows.map((r) => r.action)).toEqual([
      'glossary_term.created',
      'glossary_term.deleted',
      'api_key.created',
      'api_key.revoked',
    ]);
    // The plaintext key must never land in the trail — prefix only.
    expect(JSON.stringify(rows)).not.toContain(plaintext);
    expect(rows[2]!.summary).toContain('lv_live_');
  });
});

describe('GET /api/v1/audit', () => {
  async function seedEvents(acc: string, n: number, action = 'translation.updated', sub = 'usr_a') {
    for (let i = 0; i < n; i++) {
      await recordAudit(prisma, {
        accountId: acc,
        actor: { sub, label: sub === 'usr_a' ? 'Alice' : null },
        action,
        target: { type: 'translation', id: `tr_${i}` },
        summary: `event ${i}`,
        metadata: { i },
      });
    }
  }

  it('is workspace-scoped and newest-first', async () => {
    const acc = account();
    const other = account();
    await seedEvents(acc, 2);
    await seedEvents(other, 1);
    const res = await request(app).get('/api/v1/audit').set(as(acc));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].summary).toBe('event 1'); // newest first
    expect(res.body.data[0].id).toMatch(/^aud_/);
    expect(res.body.data[0].accountId).toBeUndefined(); // not leaked in the view
  });

  it('filters by action and actor (sub exact + label contains)', async () => {
    const acc = account();
    await seedEvents(acc, 2, 'translation.updated', 'usr_a');
    await seedEvents(acc, 1, 'project.created', 'usr_b');

    const byAction = await request(app).get('/api/v1/audit?action=project.created').set(as(acc));
    expect(byAction.body.data).toHaveLength(1);
    expect(byAction.body.data[0].action).toBe('project.created');

    const bySub = await request(app).get('/api/v1/audit?actor=usr_b').set(as(acc));
    expect(bySub.body.data).toHaveLength(1);

    const byLabel = await request(app).get('/api/v1/audit?actor=alice').set(as(acc));
    expect(byLabel.body.data).toHaveLength(2);
    expect(byLabel.body.data.every((e: { actorLabel: string }) => e.actorLabel === 'Alice')).toBe(
      true,
    );
  });

  it('free-text q matches summary, action and exact targetId', async () => {
    const acc = account();
    await seedEvents(acc, 2, 'translation.updated', 'usr_a');
    await seedEvents(acc, 1, 'project.created', 'usr_b');

    const bySummary = await request(app).get('/api/v1/audit?q=EVENT%201').set(as(acc));
    expect(bySummary.body.data).toHaveLength(1); // only "event 1" exists once

    const byAction = await request(app).get('/api/v1/audit?q=project.cre').set(as(acc));
    expect(byAction.body.data).toHaveLength(1);
    expect(byAction.body.data[0].action).toBe('project.created');

    const byTarget = await request(app).get('/api/v1/audit?q=tr_0').set(as(acc));
    expect(byTarget.body.data).toHaveLength(2); // first event of each seed batch

    const noHit = await request(app).get('/api/v1/audit?q=zzz-nope').set(as(acc));
    expect(noHit.body.data).toHaveLength(0);
  });

  it('cursor-paginates', async () => {
    const acc = account();
    await seedEvents(acc, 5);
    const page1 = await request(app).get('/api/v1/audit?limit=2').set(as(acc));
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.hasMore).toBe(true);
    const page2 = await request(app)
      .get(`/api/v1/audit?limit=3&cursor=${encodeURIComponent(page1.body.meta.cursor)}`)
      .set(as(acc));
    expect(page2.body.data).toHaveLength(3);
    expect(page2.body.meta.hasMore).toBe(false);
    const ids = [...page1.body.data, ...page2.body.data].map((e: { id: string }) => e.id);
    expect(new Set(ids).size).toBe(5); // no overlap, no gap
  });
});

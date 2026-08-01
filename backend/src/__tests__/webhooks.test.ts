import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';

/*
 * Webhook subscription tests — CRUD (secret shown once, account
 * scoping, enable/disable, delete), the Locavello-Signature HMAC
 * scheme, and the outbox worker's allowlist matcher. Requires
 * DATABASE_URL (CI provides the postgres service; locally use the
 * locavello_dev database).
 */

import webhookSubscriptionsRouter from '../routes/webhook-subscriptions.js';
import { zodErrorHandler } from '../middleware/zod-error.js';
import { ApiError, sendErr } from '../lib/http.js';
import { prisma } from '../lib/db.js';
import {
  buildWebhookSignature,
  verifyWebhookSignature,
  generateWebhookSecret,
  SIGNATURE_HEADER,
} from '../lib/webhook-signature.js';
import { subscriptionMatchesType } from '../services/outbox-worker.js';

const ACCOUNT = `acc_test_${randomBytes(6).toString('hex')}`;
const OTHER_ACCOUNT = `acc_test_${randomBytes(6).toString('hex')}`;

function makeApp() {
  const app = express();
  app.use(express.json());
  const stubAuth = (req: Request, _res: Response, next: NextFunction) => {
    req.auth = {
      sub: (req.headers['x-test-sub'] as string) ?? 'usr_test',
      accountId: (req.headers['x-test-account'] as string) ?? ACCOUNT,
      scope: '',
      iss: 'test',
      aud: 'test',
      exp: 0,
      iat: 0,
    } as never;
    next();
  };
  app.use('/api/v1/webhook-subscriptions', stubAuth, webhookSubscriptionsRouter);
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

afterAll(async () => {
  await prisma.webhookSubscription.deleteMany({
    where: { accountId: { in: [ACCOUNT, OTHER_ACCOUNT] } },
  });
  await prisma.auditEvent.deleteMany({ where: { accountId: { in: [ACCOUNT, OTHER_ACCOUNT] } } });
});

describe('webhook subscriptions — CRUD', () => {
  let subId = '';
  let secret = '';

  it('creates a subscription and returns the whsec_ secret exactly once', async () => {
    const res = await request(app)
      .post('/api/v1/webhook-subscriptions')
      .send({ url: 'https://example.com/hooks/locavello' });
    expect(res.status).toBe(201);
    expect(res.body.data.id).toMatch(/^whs_/);
    expect(res.body.data.secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(res.body.data.events).toEqual(['*']);
    expect(res.body.data.active).toBe(true);
    subId = res.body.data.id;
    secret = res.body.data.secret;
  });

  it('accepts an event-type allowlist, rejecting junk types', async () => {
    const bad = await request(app)
      .post('/api/v1/webhook-subscriptions')
      .send({ url: 'https://example.com/x', events: ['not-an-event'] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');

    const ok = await request(app)
      .post('/api/v1/webhook-subscriptions')
      .send({
        url: 'https://example.com/releases-only',
        events: ['locavello.release.published.v1'],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.data.events).toEqual(['locavello.release.published.v1']);
  });

  it('lists subscriptions WITHOUT the secret', async () => {
    const res = await request(app).get('/api/v1/webhook-subscriptions');
    expect(res.status).toBe(200);
    const subs = res.body.data.subscriptions as Array<Record<string, unknown>>;
    expect(subs.length).toBe(2);
    for (const s of subs) expect(s.secret).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it('is account-scoped — another account sees nothing and cannot touch it', async () => {
    const list = await request(app)
      .get('/api/v1/webhook-subscriptions')
      .set('x-test-account', OTHER_ACCOUNT);
    expect(list.body.data.subscriptions).toEqual([]);

    const patch = await request(app)
      .patch(`/api/v1/webhook-subscriptions/${subId}`)
      .set('x-test-account', OTHER_ACCOUNT)
      .send({ active: false });
    expect(patch.status).toBe(404);

    const del = await request(app)
      .delete(`/api/v1/webhook-subscriptions/${subId}`)
      .set('x-test-account', OTHER_ACCOUNT);
    expect(del.status).toBe(404);
  });

  it('disables and re-enables a subscription', async () => {
    const off = await request(app)
      .patch(`/api/v1/webhook-subscriptions/${subId}`)
      .send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body.data.active).toBe(false);

    const on = await request(app)
      .patch(`/api/v1/webhook-subscriptions/${subId}`)
      .send({ active: true });
    expect(on.status).toBe(200);
    expect(on.body.data.active).toBe(true);
  });

  it('deletes a subscription', async () => {
    const res = await request(app).delete(`/api/v1/webhook-subscriptions/${subId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(true);
    const gone = await request(app)
      .patch(`/api/v1/webhook-subscriptions/${subId}`)
      .send({ active: false });
    expect(gone.status).toBe(404);
  });

  it('writes webhook.* audit rows for the lifecycle', async () => {
    const rows = await prisma.auditEvent.findMany({
      where: { accountId: ACCOUNT, targetType: 'webhook' },
      orderBy: { createdAt: 'asc' },
    });
    const actions = rows.map((r) => r.action);
    expect(actions).toContain('webhook.created');
    expect(actions).toContain('webhook.disabled');
    expect(actions).toContain('webhook.enabled');
    expect(actions).toContain('webhook.deleted');
    // Signing secrets must never land in the trail.
    expect(JSON.stringify(rows)).not.toContain('whsec_');
  });
});

describe('webhook signature — Locavello-Signature t=…,v1=…', () => {
  const body = JSON.stringify({
    id: 'evt_x',
    type: 'locavello.release.published.v1',
    occurredAt: new Date().toISOString(),
    data: { releaseId: 'rel_x' },
  });

  it('exports the product-flavored header name', () => {
    expect(SIGNATURE_HEADER).toBe('Locavello-Signature');
  });

  it('generates whsec_ secrets', () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[0-9a-f]{48}$/);
  });

  it('builds a t=…,v1=… header that verifies', () => {
    const secret = generateWebhookSecret();
    const header = buildWebhookSignature(secret, body);
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, body, header)).toBe(true);
  });

  it('rejects a tampered body and the wrong secret', () => {
    const secret = generateWebhookSecret();
    const header = buildWebhookSignature(secret, body);
    expect(verifyWebhookSignature(secret, body + 'x', header)).toBe(false);
    expect(verifyWebhookSignature(generateWebhookSecret(), body, header)).toBe(false);
  });

  it('rejects stale timestamps beyond the tolerance', () => {
    const secret = generateWebhookSecret();
    const t = Math.floor(Date.now() / 1000) - 3600;
    const header = buildWebhookSignature(secret, body, t);
    expect(verifyWebhookSignature(secret, body, header)).toBe(false);
    expect(verifyWebhookSignature(secret, body, header, { now: t + 60 })).toBe(true);
  });

  it('is deterministic for a pinned timestamp (receiver-side recompute)', () => {
    const header = buildWebhookSignature('whsec_fixed', 'payload', 1_700_000_000);
    expect(header).toBe(buildWebhookSignature('whsec_fixed', 'payload', 1_700_000_000));
    expect(verifyWebhookSignature('whsec_fixed', 'payload', header, { now: 1_700_000_000 })).toBe(
      true,
    );
  });
});

describe('outbox fan-out — allowlist matcher', () => {
  it('matches "*" and exact types only', () => {
    expect(subscriptionMatchesType(['*'], 'locavello.release.published.v1')).toBe(true);
    expect(
      subscriptionMatchesType(
        ['locavello.release.published.v1'],
        'locavello.release.published.v1',
      ),
    ).toBe(true);
    expect(
      subscriptionMatchesType(['locavello.project.created.v1'], 'locavello.release.published.v1'),
    ).toBe(false);
    expect(subscriptionMatchesType([], 'locavello.release.published.v1')).toBe(false);
    expect(subscriptionMatchesType('not-an-array', 'locavello.release.published.v1')).toBe(false);
  });
});

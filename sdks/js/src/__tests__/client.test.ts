import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LocavelloClient, LocavelloError, paginate } from '../index.js';

/** Recorded stub request. */
interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  contentType: string | undefined;
  body: unknown;
}

type Handler = (seen: Seen, res: http.ServerResponse) => void;

const envelope = (data: unknown, meta?: Record<string, unknown>) =>
  JSON.stringify({ data, error: null, meta: { requestId: 'req_test', timestamp: 'now', ...meta } });

let server: http.Server;
let baseUrl: string;
let seen: Seen[] = [];
let handler: Handler = (_seen, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(envelope({}));
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c: Buffer) => (raw += c.toString()));
    req.on('end', () => {
      const s: Seen = {
        method: req.method ?? '',
        url: req.url ?? '',
        auth: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: raw ? JSON.parse(raw) : undefined,
      };
      seen.push(s);
      handler(s, res);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => {
    server.close(() => r());
  });
});

beforeEach(() => {
  seen = [];
  handler = (_seen, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(envelope({}));
  };
});

const client = () => new LocavelloClient({ apiKey: 'lv_live_test123', baseUrl, retryBaseMs: 1 });

describe('auth', () => {
  it('sends the Bearer API key on authed calls', async () => {
    handler = (_s, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(envelope({ ok: true, errors: [], warnings: [], stats: { keys: 0, locales: 0 } }));
    };
    await client().releases.check('prj_1');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.auth).toBe('Bearer lv_live_test123');
    expect(seen[0]!.url).toBe('/api/v1/projects/prj_1/check');
  });

  it('sends NO Authorization header on public calls', async () => {
    handler = (_s, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        envelope({
          projectId: 'prj_1',
          locale: 'id',
          releaseId: null,
          enabledLocales: [],
          sourceLocale: 'en',
          catalog: {},
        }),
      );
    };
    // No apiKey configured at all — public must still work.
    const anon = new LocavelloClient({ baseUrl, retryBaseMs: 1 });
    const cat = await anon.public.catalog('prj_1', 'id');
    expect(cat.locale).toBe('id');
    expect(seen[0]!.auth).toBeUndefined();
    expect(seen[0]!.url).toBe('/api/v1/public/projects/prj_1/catalog?locale=id');
  });

  it('fails fast with AUTH_REQUIRED when no key is configured (no request made)', async () => {
    delete process.env.LOCAVELLO_API_KEY;
    const anon = new LocavelloClient({ baseUrl });
    await expect(anon.billing.get()).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
      status: 0,
    });
    expect(seen).toHaveLength(0);
  });
});

describe('envelope + errors', () => {
  it('unwraps the data slot', async () => {
    handler = (_s, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(envelope({ id: 'prj_1', slug: 'demo', name: 'Demo' }));
    };
    const project = await client().projects.get('prj_1');
    expect(project.id).toBe('prj_1');
    expect(project.slug).toBe('demo');
  });

  it('maps envelope errors to LocavelloError with code/status/requestId/param', async () => {
    handler = (_s, res) => {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: null,
          error: { code: 'NOT_FOUND', message: 'project not found', param: 'id' },
          meta: { requestId: 'req_abc', timestamp: 'now' },
        }),
      );
    };
    // POST — no retry noise in this test.
    const err = await client()
      .projects.create({ slug: 'x', name: 'X' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(LocavelloError);
    const le = err as LocavelloError;
    expect(le.status).toBe(404);
    expect(le.code).toBe('NOT_FOUND');
    expect(le.message).toBe('project not found');
    expect(le.requestId).toBe('req_abc');
    expect(le.param).toBe('id');
  });

  it('throws INVALID_RESPONSE on non-JSON bodies', async () => {
    handler = (_s, res) => {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<html>oops</html>');
    };
    await expect(client().billing.get()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('serializes JSON bodies with content-type', async () => {
    handler = (_s, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(envelope({ created: 1, updated: 0, archived: 0 }));
    };
    const result = await client().keys.upsert('prj_1', [
      { name: 'Create link', sourceText: 'Create link' },
    ]);
    expect(result.created).toBe(1);
    expect(seen[0]!.method).toBe('PUT');
    expect(seen[0]!.contentType).toBe('application/json');
    expect(seen[0]!.body).toEqual({
      keys: [{ name: 'Create link', sourceText: 'Create link' }],
      prune: false,
    });
  });
});

describe('pagination', () => {
  it('returns Page objects from meta cursor/hasMore and paginate() walks all pages', async () => {
    handler = (s, res) => {
      const hasCursor = s.url.includes('cursor=c1');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        hasCursor
          ? envelope([{ id: 'prj_2' }], { cursor: null, hasMore: false })
          : envelope([{ id: 'prj_1' }], { cursor: 'c1', hasMore: true }),
      );
    };
    const c = client();
    const first = await c.projects.list();
    expect(first.data.map((p) => p.id)).toEqual(['prj_1']);
    expect(first.cursor).toBe('c1');
    expect(first.hasMore).toBe(true);

    seen = [];
    const all: string[] = [];
    for await (const p of paginate((cursor) => c.projects.list({ cursor }))) {
      all.push(p.id);
    }
    expect(all).toEqual(['prj_1', 'prj_2']);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.url).toContain('cursor=c1');
  });
});

describe('retries', () => {
  it('retries idempotent GETs on 503 then succeeds', async () => {
    let calls = 0;
    handler = (_s, res) => {
      calls += 1;
      if (calls < 3) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: null,
            error: { code: 'UNAVAILABLE', message: 'try later' },
            meta: { requestId: 'r', timestamp: 'now' },
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(envelope({ id: 'prj_1' }));
    };
    const project = await client().projects.get('prj_1');
    expect(project.id).toBe('prj_1');
    expect(calls).toBe(3);
  });

  it('gives up after 2 retries and surfaces the last error', async () => {
    handler = (_s, res) => {
      res.writeHead(429, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: null,
          error: { code: 'RATE_LIMITED', message: 'slow down' },
          meta: { requestId: 'r', timestamp: 'now' },
        }),
      );
    };
    await expect(client().projects.get('prj_1')).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      status: 429,
    });
    expect(seen).toHaveLength(3); // 1 attempt + 2 retries
  });

  it('never retries writes', async () => {
    handler = (_s, res) => {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          data: null,
          error: { code: 'UNAVAILABLE', message: 'down' },
          meta: { requestId: 'r', timestamp: 'now' },
        }),
      );
    };
    await expect(client().jobs.translate('prj_1', 'id')).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(seen).toHaveLength(1);
  });
});

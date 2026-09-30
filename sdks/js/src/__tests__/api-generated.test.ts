import { afterEach, describe, expect, it } from 'vitest';
import { LocavelloClient } from '../index.js';

// client.api: every feature route, generated from the API spec (scripts/apigen.sh).
describe('client.api (generated from the spec)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function capture() {
    const seen: Array<{ url: string; method: string; body?: string; auth: string | null }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({
        url: input instanceof Request ? input.url : input.toString(),
        method: init?.method ?? 'GET',
        body: typeof init?.body === 'string' ? init.body : undefined,
        auth: new Headers(init?.headers).get('authorization'),
      });
      return new Response(JSON.stringify({ data: { ok: true }, error: null, meta: { requestId: 'r', timestamp: '' } }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    return seen;
  }

  it('creates a project with the fields Locavello validates, with the API key', async () => {
    const seen = capture();
    const client = new LocavelloClient({ apiKey: 'lv_live_test', baseUrl: 'https://locavello.test' });
    await client.api.projectsCreate({ slug: 'web', name: 'Web app', mode: 'sdk' });
    expect(seen[0]!.method).toBe('POST');
    expect(seen[0]!.url).toBe('https://locavello.test/api/v1/projects');
    expect(JSON.parse(seen[0]!.body!)).toEqual({ slug: 'web', name: 'Web app', mode: 'sdk' });
    expect(seen[0]!.auth).toBe('Bearer lv_live_test');
  });

  it('puts path parameters in the path and query fields in the query', async () => {
    const seen = capture();
    const client = new LocavelloClient({ apiKey: 'lv_live_test', baseUrl: 'https://locavello.test' });
    await client.api.projectsGet('prj 1');
    await client.api.projectsKeys('prj_1', { locale: 'id', q: 'hero title' });
    expect(seen[0]!.url).toBe('https://locavello.test/api/v1/projects/prj%201');
    const listed = new URL(seen[1]!.url);
    expect(listed.pathname).toBe('/api/v1/projects/prj_1/keys');
    expect(Object.fromEntries(listed.searchParams)).toEqual({ locale: 'id', q: 'hero title' });
  });

  it('calls the public surface without a key, like client.public', async () => {
    const seen = capture();
    const anon = new LocavelloClient({ baseUrl: 'https://locavello.test' });
    await anon.api.publicProjectsCatalog('prj_1', { locale: 'id' });
    expect(seen[0]!.url).toBe('https://locavello.test/api/v1/public/projects/prj_1/catalog?locale=id');
    expect(seen[0]!.auth).toBeNull();
  });

  it('has a method for every feature route', () => {
    const client = new LocavelloClient({ apiKey: 'lv_live_test' });
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(client.api)).filter((n) => n !== 'constructor' && n !== 'call');
    expect(methods.length).toBeGreaterThan(40);
  });
});

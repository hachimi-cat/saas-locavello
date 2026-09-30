import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ROUTES, buildApiCommand } from '../commands/api.generated.js';
import { withApiOptions } from '../lib/apigen-call.js';

// `locavello api <area> <action>`: every feature route, generated from the API spec.
// The CLI's own client (lib/api.ts) is fetch: stub it and look at what goes out.
interface Sent { url: string; method: string; auth: string | null; body: unknown }
let sent: Sent[];
let cwd: string;
let tmp: string;

function program(): Command {
  // The way src/index.ts registers it.
  return new Command().name('locavello').exitOverride().addCommand(withApiOptions(buildApiCommand()));
}

async function run(argv: string[]): Promise<number> {
  try {
    await program().parseAsync(['node', 'locavello', ...argv]);
    return 0;
  } catch (e) {
    const m = e instanceof Error ? /^__exit:(\d+)$/.exec(e.message) : null;
    if (m) return Number(m[1]);
    throw e;
  }
}

beforeEach(() => {
  sent = [];
  // No locavello.json up the tree: the API URL falls back to the hosted one.
  cwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'locavello-cli-api-'));
  process.chdir(tmp);
  process.env.LOCAVELLO_API_KEY = 'lv_live_test';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`__exit:${code ?? 0}`);
  }) as never);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    sent.push({
      url,
      method: init?.method ?? 'GET',
      auth: new Headers(init?.headers).get('authorization'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return new Response(JSON.stringify({ data: { ok: true }, error: null, meta: {} }), {
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.chdir(cwd);
  fs.rmSync(tmp, { recursive: true, force: true });
  delete process.env.LOCAVELLO_API_KEY;
});

describe('locavello api', () => {
  it('has a command for every feature route', () => {
    const count = API_ROUTES.reduce((n, a) => n + a.routes.length, 0);
    expect(count).toBeGreaterThan(40);
    expect(API_ROUTES.map((a) => a.area)).toContain('projects');
  });

  it('creates a project from flags, typed as the spec says, with the API key', async () => {
    expect(await run(['api', 'projects', 'create', '--slug', 'web', '--name', 'Web app', '--mode', 'sdk'])).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      url: 'https://locavello.forjio.com/api/v1/projects',
      method: 'POST',
      auth: 'Bearer lv_live_test',
      body: { slug: 'web', name: 'Web app', mode: 'sdk' },
    });
  });

  it('refuses a value the spec does not allow, and a missing required field', async () => {
    expect(await run(['api', 'projects', 'create', '--slug', 'web', '--name', 'Web', '--mode', 'cloud'])).toBe(1);
    expect(await run(['api', 'projects', 'create', '--name', 'Web'])).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it('puts path parameters in the path and query fields in the query', async () => {
    expect(await run(['api', 'projects', 'keys', 'prj 1', '--locale', 'id', '--status', 'needs_review'])).toBe(0);
    const url = new URL(sent[0]!.url);
    expect(url.pathname).toBe('/api/v1/projects/prj%201/keys');
    expect(Object.fromEntries(url.searchParams)).toEqual({ locale: 'id', status: 'needs_review' });
  });

  it('takes --api-key and --api-url anywhere on the line', async () => {
    expect(await run(['api', 'projects', 'get', 'prj_1', '--api-key', 'lv_live_flag', '--api-url', 'http://localhost:4270'])).toBe(0);
    expect(sent[0]).toMatchObject({ url: 'http://localhost:4270/api/v1/projects/prj_1', auth: 'Bearer lv_live_flag' });
  });

  it('asks for a key, except on the public surface', async () => {
    delete process.env.LOCAVELLO_API_KEY;
    expect(await run(['api', 'projects', 'list'])).toBe(1);
    expect(sent).toHaveLength(0);
    expect(await run(['api', 'public', 'preview', 'pv_1'])).toBe(0);
    expect(sent[0]!.url).toBe('https://locavello.forjio.com/api/v1/public/preview/pv_1');
  });
});

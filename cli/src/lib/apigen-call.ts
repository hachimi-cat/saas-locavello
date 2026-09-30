/**
 * How the generated `locavello api <area> <action>` commands (commands/api.generated.ts)
 * make their call: this CLI's own credentials (`--api-key` or LOCAVELLO_API_KEY), its
 * envelope-aware HTTP client (lib/api.ts) and its single failure path (lib/fail.ts).
 */
import type { Command } from 'commander';
import { apiRequest, resolveApiKey } from './api.js';
import { findConfig, loadConfig } from './config.js';
import { fail } from './fail.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const DEFAULT_API_URL = 'https://locavello.forjio.com';

/**
 * The options every `locavello api …` command takes, like the CLI's other commands:
 * `--api-key` (defaults to LOCAVELLO_API_KEY) and `--api-url` (defaults to the apiUrl in
 * locavello.json when there is one, else the hosted API). Declared once on the `api`
 * group; commander reads a parent's options anywhere on the command line.
 */
export function withApiOptions(api: Command): Command {
  return api
    .option('--api-key <key>', 'API key (defaults to LOCAVELLO_API_KEY)')
    .option('--api-url <url>', `API base URL (defaults to locavello.json's apiUrl, else ${DEFAULT_API_URL})`);
}

function apiUrl(flag: string | undefined): string {
  if (flag) return flag;
  return findConfig() ? loadConfig().config.apiUrl : DEFAULT_API_URL;
}

export async function callRoute(
  cmd: Command,
  method: string,
  path: string,
  query: Record<string, unknown>,
  body: Record<string, unknown> | undefined,
): Promise<void> {
  const opts = cmd.optsWithGlobals() as { apiKey?: string; apiUrl?: string };
  // The public surface (/public/*) needs no key, as in the SDKs.
  const isPublic = path.startsWith('/api/v1/public/');
  const apiKey = isPublic ? (opts.apiKey ?? process.env.LOCAVELLO_API_KEY ?? '') : resolveApiKey(opts.apiKey);
  const client = { apiUrl: apiUrl(opts.apiUrl), apiKey };
  const qs = new URLSearchParams(
    Object.entries(query).map(([k, v]): [string, string] => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  ).toString();
  // apiRequest adds the /api/v1 prefix itself.
  const pathname = path.replace(/^\/api\/v1(?=\/)/, '');
  const data = await apiRequest<unknown>(client, method as Method, qs ? `${pathname}?${qs}` : pathname, body);
  console.log(JSON.stringify(data, null, 2));
}

/** Bad input to a generated command (a missing field, a value the spec does not allow). */
export async function failRoute(_cmd: Command, err: unknown): Promise<never> {
  return fail(err instanceof Error ? err.message : String(err));
}

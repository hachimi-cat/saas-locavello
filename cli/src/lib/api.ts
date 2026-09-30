import { fail } from './fail.js';
import { refreshIfSessionToken, storedBearer } from './credentials.js';

/**
 * Envelope-aware HTTP client for the Locavello engine API.
 *
 * Base URL is `<apiUrl>/api/v1`; auth is `Authorization: Bearer
 * lv_live_…` (or the Huudis session from `locavello auth login`). Every
 * response uses the Forjio envelope `{ data, error, meta }` — on non-2xx
 * we print `error.code: error.message` and exit 1.
 */

export interface ApiEnvelope<T> {
  data: T;
  error: { code: string; message: string; field?: string } | null;
  meta?: Record<string, unknown>;
}

export interface ApiClient {
  apiUrl: string;
  apiKey: string;
}

/**
 * Resolve the bearer: the `--api-key` flag, then `LOCAVELLO_API_KEY`, then
 * what `locavello auth login` saved (an API key, or a Huudis session).
 */
export function resolveApiKey(flag?: string): string {
  const key = flag || process.env.LOCAVELLO_API_KEY || storedBearer()?.token;
  if (!key) {
    return fail(
      'Not signed in. Run `locavello auth login --api-key <lv_live_…>` (or `locavello auth login` with your Huudis account), set LOCAVELLO_API_KEY, or pass --api-key <lv_live_…>.',
    );
  }
  return key;
}

export async function apiRequest<T>(
  client: ApiClient,
  method: 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE',
  pathname: string,
  body?: unknown,
): Promise<T> {
  const url = `${client.apiUrl.replace(/\/+$/, '')}/api/v1${pathname}`;
  let bearer: string;
  try {
    bearer = await refreshIfSessionToken(client.apiKey);
  } catch (e) {
    return fail((e as Error).message);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    return fail(`Request to ${url} failed: ${(e as Error).message}`);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // fall through — handled below
  }

  if (!res.ok) {
    const err = (json as ApiEnvelope<unknown> | null)?.error;
    if (err?.code) return fail(`${err.code}: ${err.message}`);
    return fail(`HTTP ${res.status} from ${url}`);
  }
  if (json === null || typeof json !== 'object' || !('data' in json)) {
    return fail(`Unexpected response shape from ${url} (no envelope).`);
  }
  return (json as ApiEnvelope<T>).data;
}

export function apiGet<T>(client: ApiClient, pathname: string): Promise<T> {
  return apiRequest<T>(client, 'GET', pathname);
}

export function apiPut<T>(client: ApiClient, pathname: string, body: unknown): Promise<T> {
  return apiRequest<T>(client, 'PUT', pathname, body);
}

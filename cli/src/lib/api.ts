import { fail } from './fail.js';

/**
 * Envelope-aware HTTP client for the Locavello engine API.
 *
 * Base URL is `<apiUrl>/api/v1`; auth is `Authorization: Bearer
 * lv_live_…`. Every response uses the Forjio envelope `{ data, error,
 * meta }` — on non-2xx we print `error.code: error.message` and exit 1.
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

/** Resolve the API key: `--api-key` flag beats `LOCAVELLO_API_KEY` env. */
export function resolveApiKey(flag?: string): string {
  const key = flag ?? process.env.LOCAVELLO_API_KEY;
  if (!key) {
    return fail('No API key. Set the LOCAVELLO_API_KEY env var or pass --api-key <lv_live_…>.');
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
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${client.apiKey}`,
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

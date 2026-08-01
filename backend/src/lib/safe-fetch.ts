import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF-guarded fetch for customer-supplied URLs (Mode B preview +
 * crawler). The crawler exists to fetch arbitrary URLs, which is
 * exactly the SSRF shape — so every request is gated:
 *
 *  - http/https only, default ports semantics left to fetch
 *  - hostname resolves to a PUBLIC unicast address (private, loopback,
 *    link-local, CGN, ULA and metadata ranges rejected)
 *  - response size capped, timeout capped, redirects re-checked
 */

function ipIsPrivate(ip: string): boolean {
  if (ip.includes(':')) {
    // IPv6: loopback, link-local, ULA, v4-mapped of private, unspecified.
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
    if (low.startsWith('::ffff:')) return ipIsPrivate(low.slice(7));
    return false;
  }
  const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b! >= 16 && b! <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 100 && b! >= 64 && b! <= 127) return true; // CGN
  return false;
}

export class UnsafeUrlError extends Error {}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError('not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UnsafeUrlError('only http/https URLs are allowed');
  }
  const host = url.hostname;
  if (isIP(host)) {
    if (ipIsPrivate(host)) throw new UnsafeUrlError('address not allowed');
    return url;
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError('hostname does not resolve');
  }
  if (addrs.length === 0 || addrs.some((a) => ipIsPrivate(a.address))) {
    throw new UnsafeUrlError('address not allowed');
  }
  return url;
}

const MAX_BYTES = 2_000_000;

/** Fetch a customer URL with the guard, a timeout, and a size cap. */
export async function safeFetchHtml(
  raw: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ finalUrl: string; html: string }> {
  let current = raw;
  // Manual redirect loop so every hop is re-guarded.
  for (let hop = 0; hop < 5; hop += 1) {
    const url = await assertPublicHttpUrl(current);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 12_000),
      headers: {
        'user-agent': 'LocavelloBot/1.0 (+https://locavello.forjio.com)',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) throw new UnsafeUrlError('redirect without location');
      current = new URL(loc, url).toString();
      continue;
    }
    if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) throw new Error('not an HTML page');
    const reader = res.body?.getReader();
    if (!reader) throw new Error('no body');
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    const html = Buffer.concat(chunks).toString('utf8');
    return { finalUrl: url.toString(), html };
  }
  throw new UnsafeUrlError('too many redirects');
}

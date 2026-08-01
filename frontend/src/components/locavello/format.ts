import { ApiRequestError } from '@/lib/api';

/** "Jul 31, 2026" / with time "Jul 31, 2026, 14:03". */
export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  }).format(d);
}

/** First 10 chars of a content hash for table display. */
export function shortHash(hash: string): string {
  return hash.slice(0, 10);
}

/** "just now" / "5m ago" / "3d ago" — the depllo audit-page helper. */
export function relativeTime(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Human message from an unknown thrown value (usually ApiRequestError). */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** API error code when available (feeds <ErrorPanel code=…>). */
export function errorCode(e: unknown): string | undefined {
  return e instanceof ApiRequestError ? e.code : undefined;
}

/**
 * Visible-length estimate — client mirror of the backend's
 * `estimateDisplayLength` (backend/src/lib/icu.ts) so the workbench's
 * live counter agrees with the server's lengthWarning: every top-level
 * ICU `{...}` argument collapses to a nominal 6 chars.
 */
export function estimateDisplayLength(message: string): number {
  let depth = 0;
  let len = 0;
  let inQuote = false;
  for (let i = 0; i < message.length; i += 1) {
    const ch = message[i];
    if (ch === "'") {
      if (message[i + 1] === "'") {
        len += 1;
        i += 1;
        continue;
      }
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && ch === '{') {
      if (depth === 0) len += 6;
      depth += 1;
      continue;
    }
    if (!inQuote && ch === '}') {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) len += 1;
  }
  return len;
}

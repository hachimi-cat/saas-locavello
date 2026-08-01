import { ulid } from 'ulid';

/**
 * ULID-based ID factory + ARN builder. Ported from saas-plugipay.
 *
 * Each product narrows `IdPrefix` to its own bounded-context types
 * (e.g. plugipay uses `cus`/`sub`/`inv`/etc.). Template ships a
 * minimal baseline of cross-service prefixes.
 */
export type IdPrefix =
  | 'evt' // outbox event
  | 'req' // request id (prefer the request-id middleware)
  | 'ffa' // feature-flag audit row (admin-portal standard)
  | 'idem' // idempotency fallback
  | 'prj' // localization project
  | 'loc' // project locale
  | 'ns' // namespace
  | 'key' // translatable key
  | 'tr' // translation
  | 'rel' // release (immutable catalog snapshot)
  | 'gls' // glossary term
  | 'tm' // translation-memory entry
  | 'pg' // Mode B site page
  | 'tj' // translation job (agent run)
  | 'ak' // developer API key
  | 'au' // agent-usage metering row
  | 'bsub' // billing subscription
  | 'rst' // roster identity (SSO display cache — admin CRM)
  | 'rmb'; // roster membership (identity ↔ accountId sighting)

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}

export function region(): string {
  return process.env.FORJIO_REGION ?? 'sgp1';
}

/**
 * Build a Forjio ARN for a resource owned by this service.
 *   forjio:<service>:<region>:<accountId>:<resource>/<id>
 *
 * Matches the ARN grammar in `@forjio/sdk` — see ADR-0002.
 */
export function buildArn(accountId: string, resource: string, id: string): string {
  const service = process.env.FORJIO_SERVICE ?? 'locavello';
  return `forjio:${service}:${region()}:${accountId}:${resource}/${id}`;
}

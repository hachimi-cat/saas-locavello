/**
 * The event catalogue — every event type Locavello sends to webhook
 * subscriptions, in one place. GET /api/v1/webhook-subscriptions/event-types
 * serves it, the dashboard's event picker renders from that response, and
 * copy/docs/webhooks.md documents the same types; a test checks that every
 * type the code writes to the outbox is here.
 *
 * Types are `locavello.<object>.<verb>.v1`. A subscription's `events` may also
 * hold `*` (everything) or a prefix ending in `*` (`locavello.release.*`).
 */
export const EVENT_TYPES = [
  { type: 'locavello.project.created.v1', description: 'A project was created.' },
  { type: 'locavello.translation.approved.v1', description: 'A translation was approved by a reviewer.' },
  { type: 'locavello.release.published.v1', description: 'A locale bundle was published as a release (served by the delivery CDN).' },
  { type: 'locavello.billing.subscribed.v1', description: 'The workspace started or changed a paid plan.' },
  {
    type: 'locavello.webhook_subscription.disabled.v1',
    description: 'Locavello switched off one of your webhook endpoints because it kept failing (sent to your other endpoints).',
  },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]['type'];

const KNOWN = new Set<string>(EVENT_TYPES.map((e) => e.type));

export function isEventType(s: string): s is EventType {
  return KNOWN.has(s);
}

/** `*` matches every type, `locavello.release.*` every type with that
 *  prefix, anything else only the exact type. */
export function eventMatches(patterns: unknown, type: string): boolean {
  if (!Array.isArray(patterns)) return false;
  return patterns.some((p) => {
    if (typeof p !== 'string' || p.length === 0) return false;
    if (p === '*' || p === type) return true;
    return p.endsWith('*') && type.startsWith(p.slice(0, -1));
  });
}

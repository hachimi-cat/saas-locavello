import type { Prisma } from '@prisma/client';
import { newId } from './ids.js';
import type { EventType } from './event-types.js';

/**
 * Write an outbox event inside the caller's transaction (ADR-0006).
 * The outbox worker (services/outbox-worker.ts) fans it out to the
 * merchant's webhook subscriptions. `type` must be in the event catalogue
 * (lib/event-types.ts) — the types the dashboard and the docs offer.
 */
export async function writeOutbox(
  tx: Prisma.TransactionClient,
  event: {
    type: EventType;
    accountId?: string | null;
    aggregateId?: string | null;
    data: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      id: newId('evt'),
      type: event.type,
      accountId: event.accountId ?? null,
      aggregateId: event.aggregateId ?? null,
      occurredAt: new Date(),
      data: event.data,
    },
  });
}

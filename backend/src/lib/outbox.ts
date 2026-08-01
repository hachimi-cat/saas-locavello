import type { Prisma } from '@prisma/client';
import { newId } from './ids.js';

/**
 * Write an outbox event inside the caller's transaction (ADR-0006).
 * The polling worker in services/outbox-worker.ts publishes it.
 */
export async function writeOutbox(
  tx: Prisma.TransactionClient,
  event: {
    type: string;
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

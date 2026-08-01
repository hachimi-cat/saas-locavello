import type { Prisma, PrismaClient } from '@prisma/client';
import type { Request } from 'express';
import { newId } from './ids.js';

/**
 * Append-only workspace audit trail (AuditEvent) — the depllo pattern.
 *
 * `recordAudit` accepts either the root prisma client or a transaction
 * client so callers that already run a transaction can make the audit
 * row atomic with the state change. Metadata must NEVER carry secret
 * values (API-key plaintext, webhook secrets, tokens) — key names/ids
 * only.
 *
 * Action vocabulary (dot-namespaced, past tense):
 *   project.created | project.updated | locale.added | locale.updated |
 *   namespace.created | namespace.updated | keys.extracted |
 *   key.updated | translation.updated | translation.approved |
 *   translation.rejected | release.published | glossary_term.created |
 *   glossary_term.deleted | api_key.created | api_key.revoked |
 *   webhook.created | webhook.enabled | webhook.disabled |
 *   webhook.deleted | job.queued | ...
 */

/** The subset of the client the audit writer needs — satisfied by both
 *  PrismaClient and Prisma.TransactionClient. */
export type AuditDb = Pick<PrismaClient | Prisma.TransactionClient, 'auditEvent'>;

export interface AuditActor {
  /** Huudis sub — or 'system' / 'apikey:…' for non-interactive writers. */
  sub: string;
  /** Optional display label (email/name) when the session carries one. */
  label?: string | null;
}

export interface AuditEntry {
  accountId: string;
  actor: AuditActor;
  action: string;
  target: { type: string; id: string };
  summary: string;
  metadata?: Record<string, unknown>;
}

/** Resolve the acting identity from the request's auth context. */
export function actorOf(req: Request): AuditActor {
  const auth = req.auth as { sub?: string; email?: string; name?: string } | undefined;
  return { sub: auth?.sub ?? 'unknown', label: auth?.email ?? auth?.name ?? null };
}

/**
 * Write one immutable audit row. Best-effort by design: the trail is an
 * observability surface, so a hiccup on the audit write must not fail
 * the mutation it describes. NOTE: when called with a TRANSACTION
 * client a DB error has already poisoned the tx — the swallow only
 * prevents a duplicate throw; the tx still rolls back.
 */
export async function recordAudit(db: AuditDb, entry: AuditEntry): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        id: newId('aud'),
        accountId: entry.accountId,
        actorSub: entry.actor.sub,
        actorLabel: entry.actor.label ?? null,
        action: entry.action,
        targetType: entry.target.type,
        targetId: entry.target.id,
        summary: entry.summary,
        metadata: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    console.error('[audit] write failed', entry.action, (e as Error).message);
  }
}

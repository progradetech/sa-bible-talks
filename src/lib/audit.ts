import { db, auditLog, type AuditAction } from '@/db';
import type { AdminContext, PublicContext } from './types';

interface RecordInput {
  action: AuditAction;
  ctx: AdminContext | PublicContext;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

export async function record({ action, ctx, targetId, metadata }: RecordInput): Promise<void> {
  const isAdmin = 'adminUserId' in ctx;

  await db.insert(auditLog).values({
    adminUserId: isAdmin ? ctx.adminUserId : null,
    actorEmail: isAdmin ? ctx.email : null,
    action,
    targetId: targetId ?? null,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    metadata: metadata ?? null,
  });
}

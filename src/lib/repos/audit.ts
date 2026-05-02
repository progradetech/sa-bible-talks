import { SQL, and, desc, eq, sql } from 'drizzle-orm';
import { auditLog, db } from '@/db';

export interface AuditEntry {
  id: string; // bigint serialized as string
  adminUserId: string | null;
  actorEmail: string | null;
  action: string;
  targetId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO string
}

export interface ListAuditOptions {
  page?: number;
  pageSize?: number;
  action?: string;
  actorEmail?: string;
  scopeToAdminUserId?: string;
}

export interface ListAuditResult {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listAudit(opts: ListAuditOptions = {}): Promise<ListAuditResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));

  const conditions: SQL[] = [];
  if (opts.action) conditions.push(eq(auditLog.action, opts.action));
  if (opts.actorEmail)
    conditions.push(eq(auditLog.actorEmail, opts.actorEmail.toLowerCase()));
  if (opts.scopeToAdminUserId)
    conditions.push(eq(auditLog.adminUserId, opts.scopeToAdminUserId));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(auditLog)
      .where(where)
      .orderBy(desc(auditLog.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLog)
      .where(where),
  ]);

  const entries: AuditEntry[] = rows.map((r) => ({
    id: r.id.toString(),
    adminUserId: r.adminUserId,
    actorEmail: r.actorEmail,
    action: r.action,
    targetId: r.targetId,
    ip: r.ip,
    userAgent: r.userAgent,
    metadata: r.metadata as Record<string, unknown> | null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { entries, total: count, page, pageSize };
}

export async function listDistinctActions(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: auditLog.action })
    .from(auditLog)
    .orderBy(auditLog.action);
  return rows.map((r) => r.action);
}

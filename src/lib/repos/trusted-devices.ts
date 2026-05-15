import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { adminUsers, auditLog, db, trustedDevices } from '@/db';
import { hashToken, generateToken, trustExpiresAt } from '../trusted-device';
import type { AdminContext } from '../types';

export interface TrustedDeviceRow {
  id: string;
  adminUserId: string;
  /** SHA-256 hex of the cookie value. Server-only — never send to client. */
  tokenHash: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

function toRow(r: typeof trustedDevices.$inferSelect): TrustedDeviceRow {
  return {
    id: r.id,
    adminUserId: r.adminUserId,
    tokenHash: r.tokenHash,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  };
}

export async function grantTrust(
  input: { adminUserId: string; userAgent: string | null },
  ctx: AdminContext,
): Promise<{ token: string; id: string }> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = trustExpiresAt();

  const [row] = await db
    .insert(trustedDevices)
    .values({
      adminUserId: input.adminUserId,
      tokenHash,
      userAgent: input.userAgent,
      expiresAt,
    })
    .returning();

  await db.insert(auditLog).values({
    adminUserId: ctx.adminUserId,
    actorEmail: ctx.email,
    action: 'device_trust_granted',
    targetId: row.id,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    metadata: { expiresAt: expiresAt.toISOString() },
  });

  return { token, id: row.id };
}

export async function findActiveTrust(
  token: string,
): Promise<{ id: string; adminUserId: string } | null> {
  const tokenHash = hashToken(token);
  const [row] = await db
    .select({ id: trustedDevices.id, adminUserId: trustedDevices.adminUserId })
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.tokenHash, tokenHash),
        isNull(trustedDevices.revokedAt),
        gt(trustedDevices.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function touchTrust(id: string): Promise<void> {
  await db
    .update(trustedDevices)
    .set({ lastSeenAt: new Date() })
    .where(eq(trustedDevices.id, id));
}

export async function listForAdmin(adminUserId: string): Promise<TrustedDeviceRow[]> {
  const rows = await db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.adminUserId, adminUserId),
        isNull(trustedDevices.revokedAt),
        gt(trustedDevices.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(trustedDevices.lastSeenAt));
  return rows.map(toRow);
}

export class TrustedDeviceNotFoundError extends Error {
  constructor() {
    super('trusted device not found');
  }
}

export async function revokeTrust(
  id: string,
  ctx: AdminContext,
): Promise<void> {
  const [row] = await db
    .select({
      id: trustedDevices.id,
      adminUserId: trustedDevices.adminUserId,
      revokedAt: trustedDevices.revokedAt,
    })
    .from(trustedDevices)
    .where(eq(trustedDevices.id, id))
    .limit(1);

  if (!row || row.adminUserId !== ctx.adminUserId || row.revokedAt) {
    throw new TrustedDeviceNotFoundError();
  }

  await db
    .update(trustedDevices)
    .set({ revokedAt: new Date() })
    .where(eq(trustedDevices.id, id));

  await db.insert(auditLog).values({
    adminUserId: ctx.adminUserId,
    actorEmail: ctx.email,
    action: 'device_trust_revoked',
    targetId: id,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    metadata: null,
  });
}

// Helper used by the proxy: given a Supabase auth user id, get the admin row.
export async function findAdminByUserId(
  userId: string,
): Promise<{ id: string; isActive: boolean; lockedUntil: Date | null } | null> {
  const [row] = await db
    .select({
      id: adminUsers.id,
      isActive: adminUsers.isActive,
      lockedUntil: adminUsers.lockedUntil,
    })
    .from(adminUsers)
    .where(eq(adminUsers.userId, userId))
    .limit(1);
  return row ?? null;
}

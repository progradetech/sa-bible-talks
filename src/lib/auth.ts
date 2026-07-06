import { eq } from 'drizzle-orm';
import { adminUsers, db } from '@/db';
import { createClient } from './supabase/server';
import type { AdminContext } from './types';

export class UnauthorizedError extends Error {
  constructor(message = 'unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export async function getAdminContext(req?: Request): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.userId, user.id))
    .limit(1);

  if (!admin) return null;
  if (!admin.isActive) return null;
  if (admin.lockedUntil && admin.lockedUntil > new Date()) return null;

  const ip = req?.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = req?.headers.get('user-agent') ?? undefined;

  return {
    userId: user.id,
    adminUserId: admin.id,
    email: admin.email,
    role: admin.role,
    ip,
    userAgent,
  };
}

// Any active signed-in account, including the leader role. Use only for
// endpoints leaders are explicitly allowed to hit (own-talk edits, geocode,
// trusted devices, claims).
export async function requireMember(req?: Request): Promise<AdminContext> {
  const ctx = await getAdminContext(req);
  if (!ctx) throw new UnauthorizedError();
  return ctx;
}

// Staff only (admin or super_admin). Leaders are rejected so every
// pre-existing call site stays closed to them by default.
export async function requireAdmin(req?: Request): Promise<AdminContext> {
  const ctx = await requireMember(req);
  if (ctx.role === 'leader') throw new ForbiddenError('admin role required');
  return ctx;
}

export async function requireSuperAdmin(req?: Request): Promise<AdminContext> {
  const ctx = await requireAdmin(req);
  if (ctx.role !== 'super_admin') throw new ForbiddenError('super_admin role required');
  return ctx;
}

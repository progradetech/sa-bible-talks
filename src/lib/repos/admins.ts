import { eq } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { adminUsers, auditLog, db } from '@/db';
import { record } from '../audit';
import type { AdminContext, AdminRole } from '../types';

export interface AdminRow {
  id: string;
  userId: string;
  email: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt: string | null;
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  invitedBy: string | null;
  hasGoogle: boolean;
  hasPassword: boolean;
}

function toRow(
  r: typeof adminUsers.$inferSelect,
  providers?: { hasGoogle: boolean; hasPassword: boolean },
): AdminRow {
  return {
    id: r.id,
    userId: r.userId,
    email: r.email,
    role: r.role,
    isActive: r.isActive,
    lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
    failedAttempts: r.failedAttempts,
    lockedUntil: r.lockedUntil?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    invitedBy: r.invitedBy,
    hasGoogle: providers?.hasGoogle ?? false,
    hasPassword: providers?.hasPassword ?? false,
  };
}

export async function listAdmins(): Promise<AdminRow[]> {
  const rows = await db.select().from(adminUsers).orderBy(adminUsers.createdAt);

  const supabase = serviceRoleClient();
  const {
    data: { users },
    error,
  } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`Failed to list auth users: ${error.message}`);

  const providersByUserId = new Map<string, { hasGoogle: boolean; hasPassword: boolean }>();
  for (const u of users) {
    // Supabase exposes provider info in two places, and which one is populated
    // depends on the SDK version and how the user was created. We OR them
    // together so a presence in either source counts.
    const identityProviders = u.identities?.map((i) => i.provider) ?? [];
    const metaProviders =
      (u.app_metadata as { providers?: unknown } | null)?.providers;
    const metaProvidersArr = Array.isArray(metaProviders)
      ? metaProviders.filter((p): p is string => typeof p === 'string')
      : [];
    const all = new Set<string>([...identityProviders, ...metaProvidersArr]);
    providersByUserId.set(u.id, {
      hasGoogle: all.has('google'),
      hasPassword: all.has('email'),
    });
  }

  return rows.map((r) => toRow(r, providersByUserId.get(r.userId)));
}

function serviceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export class AdminAlreadyExistsError extends Error {
  constructor(public readonly email: string) {
    super(`admin already exists: ${email}`);
  }
}

export async function inviteAdmin(
  input: { email: string; role: AdminRole; redirectOrigin?: string },
  ctx: AdminContext,
): Promise<AdminRow> {
  const email = input.email.trim().toLowerCase();

  const existing = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new AdminAlreadyExistsError(email);
  }

  const supabase = serviceRoleClient();

  // Find existing auth user, otherwise send invite (which creates one).
  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error(`Failed to list auth users: ${listErr.message}`);

  // The redirectTo param overrides Supabase's default Site URL on a per-call
  // basis. We aim it at /auth/callback (which exchanges the code for a
  // session) with a `next` hop into setup-password so the new admin sets a
  // real password before TOTP enrollment.
  const inviteOpts = input.redirectOrigin
    ? { redirectTo: `${input.redirectOrigin}/auth/callback?next=/admin/setup-password` }
    : undefined;

  let authUser = users.find((u) => u.email?.toLowerCase() === email);
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, inviteOpts);
    if (error) throw new Error(`Invite failed: ${error.message}`);
    authUser = data.user;
  }

  const [admin] = await db
    .insert(adminUsers)
    .values({
      userId: authUser.id,
      email,
      role: input.role,
      invitedBy: ctx.adminUserId,
    })
    .returning();

  await db.insert(auditLog).values({
    adminUserId: ctx.adminUserId,
    actorEmail: ctx.email,
    action: 'admin_invite',
    targetId: admin.id,
    ip: ctx.ip ?? null,
    userAgent: ctx.userAgent ?? null,
    metadata: { email, role: input.role },
  });

  return toRow(admin);
}

interface UpdateAdminInput {
  isActive?: boolean;
  role?: AdminRole;
}

export async function updateAdmin(
  id: string,
  input: UpdateAdminInput,
  ctx: AdminContext,
): Promise<void> {
  const updates: Partial<typeof adminUsers.$inferInsert> = {};
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.role !== undefined) updates.role = input.role;

  if (Object.keys(updates).length === 0) return;

  await db.update(adminUsers).set(updates).where(eq(adminUsers.id, id));

  if (input.isActive !== undefined) {
    await record({
      action: 'admin_deactivate',
      ctx,
      targetId: id,
      metadata: { isActive: input.isActive },
    });
  }
  if (input.role !== undefined) {
    await record({
      action: 'admin_role_change',
      ctx,
      targetId: id,
      metadata: { role: input.role },
    });
  }
}

export class AdminNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`admin not found: ${id}`);
  }
}

export async function setAdminPassword(
  id: string,
  password: string,
  ctx: AdminContext,
): Promise<void> {
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, id))
    .limit(1);
  if (!admin) throw new AdminNotFoundError(id);

  const supabase = serviceRoleClient();

  // Look up current identities so we can record whether this was a reset of an
  // existing password or the first time one was set on the account.
  const { data: userData, error: getErr } = await supabase.auth.admin.getUserById(
    admin.userId,
  );
  if (getErr) throw new Error(`Failed to read auth user: ${getErr.message}`);
  const hadPasswordBefore =
    userData.user?.identities?.some((i) => i.provider === 'email') ?? false;

  const { error: updateErr } = await supabase.auth.admin.updateUserById(admin.userId, {
    password,
    email_confirm: true,
  });
  if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

  await record({
    action: 'admin_password_set',
    ctx,
    targetId: id,
    metadata: { email: admin.email, addedPasswordIdentity: !hadPasswordBefore },
  });
}

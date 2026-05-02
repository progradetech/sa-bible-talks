/**
 * Bootstrap an admin (or super-admin) account.
 *
 * Usage:
 *   npm run create-admin -- --email andrew@progradetechlabs.com --role super_admin
 *
 * What this does:
 *   1. Ensures the site_settings singleton row exists
 *   2. Looks up the auth.users entry for the email
 *      - If absent: invites the user via Supabase Auth (magic link email)
 *      - If present: reuses it
 *   3. Inserts an admin_users row linking auth.users.id → role
 *   4. Records an audit_log entry for the invite
 *
 * Idempotent: re-running for an email that already has an admin_users row
 * just prints the existing role and exits.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env. Run locally only.
 */

import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { db } from '../src/db';
import { adminUsers, auditLog, siteSettings } from '../src/db/schema';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string', short: 'e' },
      role: { type: 'string', short: 'r', default: 'admin' },
    },
    strict: true,
    allowPositionals: false,
  });

  const email = values.email?.trim().toLowerCase();
  const role = values.role as 'super_admin' | 'admin';

  if (!email) {
    console.error('Usage: npm run create-admin -- --email <email> [--role super_admin|admin]');
    process.exit(1);
  }
  if (role !== 'super_admin' && role !== 'admin') {
    console.error('--role must be "super_admin" or "admin"');
    process.exit(1);
  }

  // 1. Ensure the singleton site_settings row exists
  await db.insert(siteSettings).values({ id: 1 }).onConflictDoNothing();

  // 2. Skip if this email is already an admin
  const existing = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);
  if (existing.length > 0) {
    console.log(`Admin already exists: ${email} (role: ${existing[0].role})`);
    return;
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // 3. Find or invite the auth user
  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error(`Failed to list auth users: ${listErr.message}`);

  let authUser = users.find((u) => u.email?.toLowerCase() === email);

  if (!authUser) {
    console.log(`Inviting ${email} via Supabase Auth...`);
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(`Invite failed: ${error.message}`);
    authUser = data.user;
    console.log(`  ✓ Invite email sent. User must click the link to set their password.`);
  } else {
    console.log(`Auth user already exists for ${email}; linking to admin role.`);
  }

  // 4. Insert the admin_users row
  const [admin] = await db
    .insert(adminUsers)
    .values({ userId: authUser.id, email, role })
    .returning();

  // 5. Audit
  await db.insert(auditLog).values({
    adminUserId: admin.id,
    actorEmail: 'bootstrap',
    action: 'admin_invite',
    targetId: admin.id,
    metadata: { email, role, source: 'create-admin script' },
  });

  console.log(`✓ Admin row created: ${email} (${role})`);
  console.log(`  admin_users.id = ${admin.id}`);
  console.log(`  Next steps for ${email}:`);
  console.log(`    1. Open the invite email and set a password (12+ chars).`);
  console.log(`    2. After Step 4 ships the admin UI, log in and enroll TOTP.`);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});

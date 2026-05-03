/**
 * Fully remove an admin so the email can be invited fresh again.
 *
 * Usage:
 *   npm run remove-admin -- --email test@example.com
 *
 * What this does:
 *   1. Looks up the auth.users entry for the email
 *   2. Deletes it via Supabase Admin API
 *   3. The admin_users row cascades automatically via the FK
 *
 * Use this for testing or to recover from a stuck invite. For routine
 * "this person should no longer have access" cases, prefer the
 * deactivate action in /admin/admins (preserves audit trail).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env. Run locally only.
 */

import { eq } from 'drizzle-orm';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { db } from '../src/db';
import { adminUsers } from '../src/db/schema';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string', short: 'e' },
    },
    strict: true,
  });

  const email = values.email?.trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run remove-admin -- --email <email>');
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const {
    data: { users },
    error: listErr,
  } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw new Error(`Failed to list auth users: ${listErr.message}`);

  const authUser = users.find((u) => u.email?.toLowerCase() === email);

  if (authUser) {
    const { error } = await supabase.auth.admin.deleteUser(authUser.id);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    console.log(`✓ Removed auth.users entry for ${email} (user_id ${authUser.id})`);
    console.log('  admin_users row cascaded via FK.');
  } else {
    console.log(`No auth.users entry found for ${email}.`);
    // Clean up any orphaned admin_users row (rare, but possible).
    const deleted = await db
      .delete(adminUsers)
      .where(eq(adminUsers.email, email))
      .returning();
    if (deleted.length > 0) {
      console.log(`✓ Removed ${deleted.length} orphaned admin_users row(s).`);
    }
  }

  console.log(`Done. ${email} can now be invited fresh.`);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});

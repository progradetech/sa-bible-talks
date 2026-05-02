/**
 * Set an admin's password directly via the Supabase Auth Admin API.
 *
 * Usage:
 *   npm run set-admin-password -- --email andrew@progradetechlabs.com --password 'somethingStrong'
 *
 * Used to bootstrap admins without the email-invite redirect flow (or to
 * recover access if an invite link is consumed/expired). The user is also
 * marked email_confirm so login isn't blocked by an unverified email.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in env. Run locally only.
 */

import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string', short: 'e' },
      password: { type: 'string', short: 'p' },
    },
    strict: true,
  });

  const email = values.email?.trim().toLowerCase();
  const password = values.password;

  if (!email || !password) {
    console.error(
      'Usage: npm run set-admin-password -- --email <email> --password <password>',
    );
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Password must be at least 12 characters');
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
  if (listErr) throw new Error(`Failed to list users: ${listErr.message}`);

  const user = users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    console.error(`No auth.users entry for ${email}. Run create-admin first.`);
    process.exit(1);
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });
  if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

  console.log(`✓ Password set for ${email} (user_id ${user.id})`);
  console.log('  Login at /admin/login. First login will prompt TOTP enrollment.');
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});

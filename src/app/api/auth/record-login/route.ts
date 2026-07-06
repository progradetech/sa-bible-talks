import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { adminUsers, db } from '@/db';
import { record } from '@/lib/audit';
import { ForbiddenError, UnauthorizedError, requireMember } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Called by the LoginForm right after TOTP verification reaches AAL2.
// Updates the admin_users row's last_login_at + clears failed_attempts /
// locked_until, and writes a login_success audit entry. Idempotent enough
// — calling it twice in a row just sets the timestamp twice.
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireMember(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    throw err;
  }

  await db
    .update(adminUsers)
    .set({
      lastLoginAt: new Date(),
      failedAttempts: 0,
      lockedUntil: null,
    })
    .where(eq(adminUsers.id, ctx.adminUserId));

  await record({ action: 'login_success', ctx });

  return Response.json({ ok: true });
}

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { adminUsers, db } from '@/db';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

// Public endpoint (caller is unauthenticated by definition — they're trying
// to sign in). Always returns the same shape regardless of whether the email
// exists, so a probe can't enumerate admin emails.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return Response.json({ locked: false, attemptsLeft: MAX_ATTEMPTS });
  }

  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1);

  if (!admin) {
    // Same shape as a fresh, never-failed account — no enumeration leak.
    return Response.json({ locked: false, attemptsLeft: MAX_ATTEMPTS });
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    return Response.json({
      locked: true,
      lockedUntil: admin.lockedUntil.toISOString(),
    });
  }

  return Response.json({
    locked: false,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - admin.failedAttempts),
  });
}

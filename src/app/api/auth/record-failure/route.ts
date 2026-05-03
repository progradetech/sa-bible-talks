import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { adminUsers, auditLog, db } from '@/db';
import { send } from '@/lib/mail';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// Called by the LoginForm after Supabase rejects credentials. Increments
// failed_attempts on the matching admin_users row, locks the account when
// the threshold is hit, writes a login_lockout audit entry, and emails the
// admin BCC inbox so a human notices unusual activity.
//
// Always returns the same shape for unknown emails (no enumeration leak).
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
    return Response.json({ locked: false, attemptsLeft: MAX_ATTEMPTS });
  }

  // If already locked, don't re-lock — just report the existing lock.
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    return Response.json({
      locked: true,
      lockedUntil: admin.lockedUntil.toISOString(),
    });
  }

  const newAttempts = admin.failedAttempts + 1;
  const shouldLock = newAttempts >= MAX_ATTEMPTS;
  const lockedUntil = shouldLock ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;

  await db
    .update(adminUsers)
    .set({
      failedAttempts: newAttempts,
      lockedUntil,
    })
    .where(eq(adminUsers.id, admin.id));

  if (shouldLock) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const userAgent = req.headers.get('user-agent') ?? null;

    await db.insert(auditLog).values({
      adminUserId: admin.id,
      actorEmail: admin.email,
      action: 'login_lockout',
      ip,
      userAgent,
      metadata: { failedAttempts: newAttempts },
    });

    // Email the BCC inbox so a human notices repeated failed attempts.
    // Wrapped in try/catch — SMTP problems shouldn't block the lockout
    // response from going back to the client.
    try {
      await send({
        to: process.env.GMAIL_SMTP_USER!,
        subject: `[SA Bible Talks] Admin locked out: ${admin.email}`,
        body:
          `Admin account ${admin.email} was locked after ${newAttempts} failed login attempts.\n\n` +
          `Locked until: ${lockedUntil!.toISOString()}\n` +
          `IP: ${ip ?? 'unknown'}\n` +
          `User-agent: ${userAgent ?? 'unknown'}\n\n` +
          `If this was the legitimate admin, they can try again after the lockout expires (15 minutes).\n` +
          `If not, investigate via /admin/audit and consider deactivating the account.`,
      });
    } catch (err) {
      console.error('Failed to send lockout alert email:', err);
    }
  }

  return Response.json({
    locked: shouldLock,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - newAttempts),
    ...(shouldLock && lockedUntil && { lockedUntil: lockedUntil.toISOString() }),
  });
}

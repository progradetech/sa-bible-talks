import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { auditLog, db, visitorRequests } from '@/db';

export const dynamic = 'force-dynamic';

// Daily purge job. Drops audit_log entries older than 2 years and
// visitor_requests older than 1 year. Triggered by the GitHub Actions
// cron workflow with a shared secret.
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  await db.delete(auditLog).where(sql`${auditLog.createdAt} < NOW() - INTERVAL '2 years'`);
  await db
    .delete(visitorRequests)
    .where(sql`${visitorRequests.createdAt} < NOW() - INTERVAL '1 year'`);

  return Response.json({ ok: true, ranAt: new Date().toISOString() });
}

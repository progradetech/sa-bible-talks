import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { bibleTalks, db } from '@/db';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import { setLeaderLink } from '@/lib/repos/leaders';

export const dynamic = 'force-dynamic';

// Admin "Remove leader": unlink the leader account from this talk and reset
// the talk's contact email to the placeholder ("no email").
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireAdmin(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    throw err;
  }

  const [talk] = await db
    .select({ leaderAdminUserId: bibleTalks.leaderAdminUserId })
    .from(bibleTalks)
    .where(eq(bibleTalks.id, id))
    .limit(1);
  if (!talk) return Response.json({ error: 'not_found' }, { status: 404 });
  if (talk.leaderAdminUserId === null) {
    return Response.json({ error: 'not_linked' }, { status: 409 });
  }

  try {
    await setLeaderLink(id, null, ctx, { resetEmailToPlaceholder: true });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('unlink leader error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

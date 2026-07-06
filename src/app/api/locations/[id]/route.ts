import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { bibleTalks, db } from '@/db';
import { remove, update } from '@/lib/repos/leaders';
import {
  ForbiddenError,
  UnauthorizedError,
  requireAdmin,
  requireMember,
} from '@/lib/auth';
import type { UpdateLeaderInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  const body = (await req.json().catch(() => ({}))) as Partial<UpdateLeaderInput>;

  if (ctx.role === 'leader') {
    // Leaders may edit only the talk linked to their account, and never the
    // contact email (their identity link) or admin notes.
    const [talk] = await db
      .select({ leaderAdminUserId: bibleTalks.leaderAdminUserId })
      .from(bibleTalks)
      .where(eq(bibleTalks.id, id))
      .limit(1);
    if (!talk || talk.leaderAdminUserId !== ctx.adminUserId) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    delete body.email;
    delete body.adminNotes;
  }

  try {
    await update(id, body, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update leader error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(
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

  try {
    await remove(id, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('delete leader error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { bibleTalks, db } from '@/db';
import { getScopeInfo, remove, talkExists, update } from '@/lib/repos/care';
import { ForbiddenError, UnauthorizedError, requireMember } from '@/lib/auth';
import { isValidStage } from '@/lib/care-stages';
import type { AdminContext, UpdateCareEntryInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

// A leader may only touch entries linked to the talk their account owns.
async function ownsEntryTalk(bibleTalkId: string | null, ctx: AdminContext): Promise<boolean> {
  if (!bibleTalkId) return false;
  const [talk] = await db
    .select({ leaderAdminUserId: bibleTalks.leaderAdminUserId })
    .from(bibleTalks)
    .where(eq(bibleTalks.id, bibleTalkId))
    .limit(1);
  return !!talk && talk.leaderAdminUserId === ctx.adminUserId;
}

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

  const entry = await getScopeInfo(id);
  if (!entry) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<UpdateCareEntryInput>;

  if (ctx.role === 'leader') {
    // A leader may only touch entries on their own talk, and may never
    // reassign an entry to a different talk (staff-only action).
    if (!(await ownsEntryTalk(entry.bibleTalkId, ctx))) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    delete body.bibleTalkId;
  } else if (body.bibleTalkId != null && !(await talkExists(body.bibleTalkId))) {
    return Response.json({ error: 'invalid_talk' }, { status: 400 });
  }

  if (body.stage !== undefined && !isValidStage(entry.type, body.stage)) {
    return Response.json({ error: 'invalid_stage' }, { status: 400 });
  }

  try {
    await update(id, body, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update care entry error:', err);
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

  const entry = await getScopeInfo(id);
  if (!entry) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  if (ctx.role === 'leader' && !(await ownsEntryTalk(entry.bibleTalkId, ctx))) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    await remove(id, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('delete care entry error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

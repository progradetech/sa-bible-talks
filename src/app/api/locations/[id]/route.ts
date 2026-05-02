import { NextRequest } from 'next/server';
import { remove, update } from '@/lib/repos/leaders';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import type { UpdateLeaderInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function authedCtx(req: NextRequest) {
  return requireAdmin(req);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await authedCtx(req);
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
    ctx = await authedCtx(req);
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

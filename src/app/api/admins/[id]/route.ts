import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireSuperAdmin } from '@/lib/auth';
import { updateAdmin } from '@/lib/repos/admins';
import type { AdminRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await requireSuperAdmin(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    throw err;
  }

  // A super_admin should not be able to demote or deactivate themselves —
  // protects against accidental lockout. They can do it via the script
  // or another super_admin if needed.
  if (id === ctx.adminUserId) {
    return Response.json({ error: 'cannot_modify_self' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    isActive?: boolean;
    role?: string;
  };

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return Response.json({ error: 'invalid_isActive' }, { status: 400 });
  }
  if (body.role !== undefined && body.role !== 'admin' && body.role !== 'super_admin') {
    return Response.json({ error: 'invalid_role' }, { status: 400 });
  }

  try {
    await updateAdmin(
      id,
      {
        isActive: body.isActive,
        role: body.role as AdminRole | undefined,
      },
      ctx,
    );
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update admin error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

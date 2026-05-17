import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireSuperAdmin } from '@/lib/auth';
import { AdminNotFoundError, setAdminPassword } from '@/lib/repos/admins';

export const dynamic = 'force-dynamic';

const MIN_PASSWORD_LENGTH = 12;

export async function POST(
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

  if (id === ctx.adminUserId) {
    return Response.json({ error: 'cannot_modify_self' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  const password = body.password;

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: 'invalid_password' }, { status: 400 });
  }

  try {
    await setAdminPassword(id, password, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof AdminNotFoundError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    console.error('set admin password error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

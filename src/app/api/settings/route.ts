import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireSuperAdmin } from '@/lib/auth';
import { updateSettings } from '@/lib/repos/site-settings';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as {
    publicIndexable?: boolean;
    defaultJitterMiles?: number;
  };

  if (
    body.publicIndexable !== undefined &&
    typeof body.publicIndexable !== 'boolean'
  ) {
    return Response.json({ error: 'invalid_publicIndexable' }, { status: 400 });
  }
  if (
    body.defaultJitterMiles !== undefined &&
    (typeof body.defaultJitterMiles !== 'number' ||
      body.defaultJitterMiles <= 0 ||
      body.defaultJitterMiles > 50)
  ) {
    return Response.json({ error: 'invalid_defaultJitterMiles' }, { status: 400 });
  }

  try {
    await updateSettings(body, ctx);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update settings error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

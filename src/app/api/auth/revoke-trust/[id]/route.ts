import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import {
  TrustedDeviceNotFoundError,
  findActiveTrust,
  revokeTrust,
} from '@/lib/repos/trusted-devices';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/trusted-device';

export const dynamic = 'force-dynamic';

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
    await revokeTrust(id, ctx);
  } catch (err) {
    if (err instanceof TrustedDeviceNotFoundError) {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    console.error('revoke trust error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }

  // If the revoked row matched the caller's own current trust cookie, clear
  // the cookie so they're bounced to 2FA on the next request rather than
  // getting silently locked out of /admin.
  const token = req.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
  if (token) {
    const stillActive = await findActiveTrust(token);
    if (!stillActive) {
      const cookieStore = await cookies();
      cookieStore.delete(TRUSTED_DEVICE_COOKIE);
    }
  }

  return Response.json({ ok: true });
}

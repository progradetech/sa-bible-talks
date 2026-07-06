import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { ForbiddenError, UnauthorizedError, requireMember } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { grantTrust } from '@/lib/repos/trusted-devices';
import { TRUSTED_DEVICE_COOKIE, trustCookieOptions } from '@/lib/trusted-device';

export const dynamic = 'force-dynamic';

// Called by LoginForm after a successful TOTP verify when the user ticked
// the "Trust this device" checkbox. We require AAL2 here — granting trust
// is a privileged action that must be paired with a real 2FA verify.
export async function POST(req: NextRequest) {
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

  const supabase = await createClient();
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aalData?.currentLevel !== 'aal2') {
    return Response.json({ error: 'aal2_required' }, { status: 403 });
  }

  const { token } = await grantTrust(
    { adminUserId: ctx.adminUserId, userAgent: ctx.userAgent ?? null },
    ctx,
  );

  const cookieStore = await cookies();
  cookieStore.set(TRUSTED_DEVICE_COOKIE, token, trustCookieOptions());

  return Response.json({ ok: true });
}

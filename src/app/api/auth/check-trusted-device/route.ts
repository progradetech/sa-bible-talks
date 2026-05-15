import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findActiveTrust, findAdminByUserId } from '@/lib/repos/trusted-devices';
import { TRUSTED_DEVICE_COOKIE } from '@/lib/trusted-device';

export const dynamic = 'force-dynamic';

// Called from LoginForm right after a successful password sign-in (AAL1).
// Decides whether to skip the TOTP step. AAL1 is fine here — that's the
// whole point of the check.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ trusted: false });
  }

  const token = req.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
  if (!token) {
    return Response.json({ trusted: false });
  }

  const trust = await findActiveTrust(token);
  if (!trust) {
    return Response.json({ trusted: false });
  }

  const admin = await findAdminByUserId(user.id);
  if (
    !admin ||
    admin.id !== trust.adminUserId ||
    !admin.isActive ||
    (admin.lockedUntil && admin.lockedUntil > new Date())
  ) {
    return Response.json({ trusted: false });
  }

  return Response.json({ trusted: true });
}

import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireSuperAdmin } from '@/lib/auth';
import { AdminAlreadyExistsError, inviteAdmin } from '@/lib/repos/admins';
import { findTalkIdByEmail, setLeaderLink } from '@/lib/repos/leaders';
import type { AdminRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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
    email?: string;
    role?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const role = body.role as AdminRole | undefined;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (role !== 'admin' && role !== 'super_admin' && role !== 'leader') {
    return Response.json({ error: 'invalid_role' }, { status: 400 });
  }

  try {
    // The current request's origin is the most reliable redirect base —
    // works for production, preview deploys, and local dev without an env
    // var that could go stale.
    const redirectOrigin = req.nextUrl.origin;
    const admin = await inviteAdmin({ email, role, redirectOrigin }, ctx);

    // For leader invites, auto-link the bible talk whose contact email
    // matches. No match is fine — they can claim one from the map.
    let linkedTalk = false;
    if (role === 'leader') {
      const talkId = await findTalkIdByEmail(email);
      if (talkId) {
        await setLeaderLink(talkId, admin.id, ctx);
        linkedTalk = true;
      }
    }
    return Response.json({ ...admin, linkedTalk }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminAlreadyExistsError) {
      return Response.json({ error: 'already_exists' }, { status: 409 });
    }
    console.error('invite admin error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

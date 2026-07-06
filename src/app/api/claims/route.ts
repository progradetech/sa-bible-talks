import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireMember } from '@/lib/auth';
import {
  ClaimRateLimitedError,
  NotClaimableError,
  requestClaim,
} from '@/lib/services/claims';

export const dynamic = 'force-dynamic';

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

  const body = (await req.json().catch(() => ({}))) as { bibleTalkId?: string };
  if (typeof body.bibleTalkId !== 'string' || !body.bibleTalkId) {
    return Response.json({ error: 'missing_field', field: 'bibleTalkId' }, { status: 400 });
  }

  try {
    await requestClaim(body.bibleTalkId, ctx, req.nextUrl.origin);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof NotClaimableError) {
      const status = err.reason === 'not_leader' ? 403 : 409;
      return Response.json({ error: err.reason }, { status });
    }
    if (err instanceof ClaimRateLimitedError) {
      return Response.json(
        { error: 'rate_limited', retryAfterMs: err.retryAfterMs },
        { status: 429 },
      );
    }
    console.error('claim request error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

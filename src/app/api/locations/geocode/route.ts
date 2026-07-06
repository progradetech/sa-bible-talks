import { NextRequest } from 'next/server';
import { geocode } from '@/lib/geocode';
import { ForbiddenError, UnauthorizedError, requireMember } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Members (including leaders) — leaders geocode their own talk's address.
    await requireMember(req);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
    if (err instanceof ForbiddenError) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as { address?: string };
  const address = body.address?.trim();
  if (!address) {
    return Response.json({ error: 'address_required' }, { status: 400 });
  }

  const result = await geocode(address);
  if (!result) {
    return Response.json({ error: 'geocode_failed' }, { status: 422 });
  }

  return Response.json(result);
}

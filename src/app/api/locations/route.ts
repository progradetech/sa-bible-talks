import { NextRequest } from 'next/server';
import { create } from '@/lib/repos/leaders';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import type { CreateLeaderInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => ({}))) as Partial<CreateLeaderInput>;

  // Validate required strings/numbers
  const requiredStrings: (keyof CreateLeaderInput)[] = [
    'name',
    'address',
    'email',
    'ministry',
    'language',
  ];
  for (const k of requiredStrings) {
    const v = body[k];
    if (typeof v !== 'string' || v.trim().length === 0) {
      return Response.json({ error: 'missing_field', field: k }, { status: 400 });
    }
  }
  if (typeof body.exactLat !== 'number' || typeof body.exactLng !== 'number') {
    return Response.json({ error: 'missing_field', field: 'exactLat/exactLng' }, { status: 400 });
  }

  try {
    const id = await create(body as CreateLeaderInput, ctx);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    console.error('create leader error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

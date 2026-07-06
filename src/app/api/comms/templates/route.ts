import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import { createTemplate } from '@/lib/repos/comms';
import { validateTemplateBody } from './validate';

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

  const parsed = validateTemplateBody(await req.json().catch(() => ({})));
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const id = await createTemplate(parsed, ctx);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    console.error('create template error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

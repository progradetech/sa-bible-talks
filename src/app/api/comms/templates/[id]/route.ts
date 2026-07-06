import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import { deleteTemplate, updateTemplate } from '@/lib/repos/comms';
import { validateTemplateBody } from '../validate';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

async function guard(req: NextRequest) {
  try {
    return { ctx: await requireAdmin(req) };
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return { response: Response.json({ error: 'unauthorized' }, { status: 401 }) };
    }
    if (err instanceof ForbiddenError) {
      return { response: Response.json({ error: 'forbidden' }, { status: 403 }) };
    }
    throw err;
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const auth = await guard(req);
  if ('response' in auth) return auth.response;

  const parsed = validateTemplateBody(await req.json().catch(() => ({})));
  if ('error' in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const { id } = await params;
    const found = await updateTemplate(id, parsed, auth.ctx);
    if (!found) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('update template error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const auth = await guard(req);
  if ('response' in auth) return auth.response;

  try {
    const { id } = await params;
    const found = await deleteTemplate(id);
    if (!found) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('delete template error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

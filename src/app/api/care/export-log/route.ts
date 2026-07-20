import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import { record } from '@/lib/audit';
import { auditAction } from '@/db';

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

  const body = (await req.json().catch(() => ({}))) as {
    format?: string;
    count?: number;
    filters?: Record<string, unknown>;
  };
  const format = body.format === 'pdf' ? 'pdf' : 'csv';
  const count = typeof body.count === 'number' ? body.count : null;
  const filters = body.filters && typeof body.filters === 'object' ? body.filters : null;

  try {
    await record({
      action: auditAction.CARE_EXPORT,
      ctx,
      metadata: { format, count, filters },
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('care export-log error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

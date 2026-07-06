import { NextRequest } from 'next/server';
import { ForbiddenError, UnauthorizedError, requireAdmin } from '@/lib/auth';
import {
  CommsRateLimitedError,
  LocalSendDisabledError,
  NoRecipientsError,
  sendBlast,
} from '@/lib/services/comms';

export const dynamic = 'force-dynamic';
// SMTP round-trips can be slow; give the send headroom beyond the default.
export const maxDuration = 60;

const MAX_SUBJECT = 200;
const MAX_BODY = 10_000;

function isLocalRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const host = req.headers.get('host') ?? '';
  return host.startsWith('localhost') || host.startsWith('127.');
}

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
    subject?: string;
    body?: string;
    includeInactive?: boolean;
    testOnly?: boolean;
  };

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.body === 'string' ? body.body.trim() : '';
  if (!subject || subject.length > MAX_SUBJECT) {
    return Response.json({ error: 'invalid_subject' }, { status: 400 });
  }
  if (!message || message.length > MAX_BODY) {
    return Response.json({ error: 'invalid_body' }, { status: 400 });
  }

  try {
    const result = await sendBlast(
      {
        subject,
        body: message,
        includeInactive: body.includeInactive === true,
        testOnly: body.testOnly === true,
        isLocal: isLocalRequest(req),
      },
      ctx,
    );
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof LocalSendDisabledError) {
      return Response.json({ error: 'local_send_disabled' }, { status: 403 });
    }
    if (err instanceof CommsRateLimitedError) {
      return Response.json(
        { error: 'rate_limited', retryAfterMs: err.retryAfterMs },
        { status: 429 },
      );
    }
    if (err instanceof NoRecipientsError) {
      return Response.json({ error: 'no_recipients' }, { status: 400 });
    }
    console.error('comms send error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

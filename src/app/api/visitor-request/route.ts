import { NextRequest } from 'next/server';
import {
  RateLimitedError,
  TurnstileFailedError,
  submit,
} from '@/lib/services/visitor-requests';
import type { PublicContext, VisitorRequestInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

interface SubmitBody extends Partial<VisitorRequestInput> {}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try {
    body = (await req.json()) as SubmitBody;
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }

  const required: (keyof VisitorRequestInput)[] = [
    'targetBibleTalkId',
    'visitorName',
    'visitorEmail',
    'message',
    'turnstileToken',
  ];
  for (const k of required) {
    const v = body[k];
    if (typeof v !== 'string' || v.trim().length === 0) {
      return Response.json({ error: 'missing_field', field: k }, { status: 400 });
    }
  }

  const input: VisitorRequestInput = {
    targetBibleTalkId: body.targetBibleTalkId!.trim(),
    visitorName: body.visitorName!.trim(),
    visitorEmail: body.visitorEmail!.trim(),
    visitorPhone: body.visitorPhone?.trim() || undefined,
    message: body.message!.trim(),
    turnstileToken: body.turnstileToken!,
  };

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = req.headers.get('user-agent') ?? undefined;
  const ctx: PublicContext = { ip, userAgent };

  try {
    const result = await submit(input, ctx);
    return Response.json({ ok: true, dispatched: result.dispatched });
  } catch (err) {
    if (err instanceof TurnstileFailedError) {
      return Response.json({ error: 'turnstile_failed' }, { status: 400 });
    }
    if (err instanceof RateLimitedError) {
      return Response.json(
        { error: 'rate_limited', retryAfterMs: err.retryAfterMs },
        { status: 429 },
      );
    }
    console.error('visitor-request error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

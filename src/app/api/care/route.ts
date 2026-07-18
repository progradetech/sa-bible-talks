import { NextRequest } from 'next/server';
import { create, findOwnTalkId, listAll, listForTalk, talkExists } from '@/lib/repos/care';
import { ForbiddenError, UnauthorizedError, requireMember } from '@/lib/auth';
import { isCareType, isValidStage } from '@/lib/care-stages';
import { check as rateLimit } from '@/lib/rate-limit';
import type { CreateCareEntryInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CREATE_LIMIT = 30;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

export async function GET(req: NextRequest) {
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

  const includeArchived = req.nextUrl.searchParams.get('archived') === '1';

  if (ctx.role === 'leader') {
    // Leaders always get only their own talk's entries — query params for
    // cross-talk scoping are ignored, not just overridden.
    const ownTalkId = await findOwnTalkId(ctx.adminUserId);
    const entries = ownTalkId ? await listForTalk(ownTalkId, { includeArchived }) : [];
    return Response.json({ entries });
  }

  const type = req.nextUrl.searchParams.get('type');
  const stage = req.nextUrl.searchParams.get('stage') ?? undefined;
  const unassigned = req.nextUrl.searchParams.get('unassigned') === '1';
  const talkId = req.nextUrl.searchParams.get('talk') ?? undefined;

  if (type !== null && !isCareType(type)) {
    return Response.json({ error: 'invalid_type' }, { status: 400 });
  }

  const entries = await listAll({
    talkId: unassigned ? undefined : talkId,
    type: type ?? undefined,
    stage,
    unassigned,
    includeArchived,
  });
  return Response.json({ entries });
}

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

  const rl = rateLimit(`care-create:${ctx.adminUserId}`, CREATE_LIMIT, CREATE_WINDOW_MS);
  if (!rl.ok) {
    return Response.json({ error: 'rate_limited' }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<CreateCareEntryInput>;

  if (!isCareType(body.type)) {
    return Response.json({ error: 'missing_field', field: 'type' }, { status: 400 });
  }
  if (body.stage !== undefined && !isValidStage(body.type, body.stage)) {
    return Response.json({ error: 'invalid_stage' }, { status: 400 });
  }

  let bibleTalkId = body.bibleTalkId ?? null;

  if (ctx.role === 'leader') {
    // Leaders may only create entries under their own talk, regardless of
    // what bibleTalkId the client sends.
    const ownTalkId = await findOwnTalkId(ctx.adminUserId);
    if (!ownTalkId) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    bibleTalkId = ownTalkId;
  } else if (bibleTalkId && !(await talkExists(bibleTalkId))) {
    return Response.json({ error: 'invalid_talk' }, { status: 400 });
  }

  try {
    const id = await create({ ...body, type: body.type, bibleTalkId }, ctx);
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    console.error('create care entry error:', err);
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

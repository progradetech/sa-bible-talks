import { eq } from 'drizzle-orm';
import { bibleTalksPii, db, visitorRequests } from '@/db';
import { record } from '../audit';
import { decryptField, encryptField, getKeyId } from '../crypto';
import { send } from '../mail';
import { check as rateLimit } from '../rate-limit';
import type { AdminContext, PublicContext, VisitorRequestInput } from '../types';

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const PER_TARGET_LIMIT = 3;
const PER_TARGET_WINDOW_MS = 60 * 60 * 1000;
const PER_IP_LIMIT = 10;
const PER_IP_WINDOW_MS = 60 * 60 * 1000;

export class TurnstileFailedError extends Error {
  constructor() {
    super('turnstile verification failed');
  }
}

export class RateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('rate limited');
  }
}

async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.CLOUDFLARE_TURNSTILE_SECRET;
  if (!secret) throw new Error('CLOUDFLARE_TURNSTILE_SECRET not set');

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  const res = await fetch(TURNSTILE_VERIFY, { method: 'POST', body });
  if (!res.ok) return false;
  const json = (await res.json()) as { success: boolean };
  return json.success;
}

export async function submit(
  input: VisitorRequestInput,
  ctx: PublicContext,
): Promise<{ id: string; dispatched: boolean }> {
  const ok = await verifyTurnstile(input.turnstileToken, ctx.ip);
  if (!ok) throw new TurnstileFailedError();

  if (ctx.ip) {
    const ipCheck = rateLimit(`ip:${ctx.ip}`, PER_IP_LIMIT, PER_IP_WINDOW_MS);
    if (!ipCheck.ok) throw new RateLimitedError(ipCheck.retryAfterMs ?? PER_IP_WINDOW_MS);
  }
  const targetCheck = rateLimit(
    `target:${input.targetBibleTalkId}`,
    PER_TARGET_LIMIT,
    PER_TARGET_WINDOW_MS,
  );
  if (!targetCheck.ok) throw new RateLimitedError(targetCheck.retryAfterMs ?? PER_TARGET_WINDOW_MS);

  const tempId = crypto.randomUUID();
  const keyId = getKeyId();
  const [nameEnc, emailEnc, phoneEnc, messageEnc] = await Promise.all([
    encryptField(input.visitorName, tempId),
    encryptField(input.visitorEmail, tempId),
    input.visitorPhone ? encryptField(input.visitorPhone, tempId) : Promise.resolve(null),
    encryptField(input.message, tempId),
  ]);

  const [row] = await db
    .insert(visitorRequests)
    .values({
      id: tempId,
      targetBibleTalkId: input.targetBibleTalkId,
      visitorNameEnc: nameEnc,
      visitorEmailEnc: emailEnc,
      visitorPhoneEnc: phoneEnc,
      messageEnc,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      keyId,
    })
    .returning();

  const dispatched = await dispatch(row.id);
  return { id: row.id, dispatched };
}

async function dispatch(requestId: string): Promise<boolean> {
  const [req] = await db
    .select()
    .from(visitorRequests)
    .where(eq(visitorRequests.id, requestId))
    .limit(1);
  if (!req || !req.targetBibleTalkId) return false;

  const [pii] = await db
    .select()
    .from(bibleTalksPii)
    .where(eq(bibleTalksPii.bibleTalkId, req.targetBibleTalkId))
    .limit(1);
  if (!pii) return false;

  try {
    const [leaderEmail, leaderName, visitorName, visitorEmail, visitorPhone, message] =
      await Promise.all([
        decryptField(pii.emailEnc, req.targetBibleTalkId),
        decryptField(pii.nameEnc, req.targetBibleTalkId),
        decryptField(req.visitorNameEnc, req.id),
        decryptField(req.visitorEmailEnc, req.id),
        req.visitorPhoneEnc ? decryptField(req.visitorPhoneEnc, req.id) : Promise.resolve(null),
        decryptField(req.messageEnc, req.id),
      ]);

    const phoneLine = visitorPhone ? `\nPhone: ${visitorPhone}` : '';
    const body =
      `Hi ${leaderName},\n\n` +
      `Someone found your group on the SA Bible Talks map and would like to connect:\n\n` +
      `From: ${visitorName} <${visitorEmail}>${phoneLine}\n\n` +
      `Their message:\n${message}\n\n` +
      `Reply directly to this email to reach them.`;

    await send({
      to: leaderEmail,
      replyTo: visitorEmail,
      bcc: process.env.GMAIL_SMTP_USER,
      subject: `Visit request from ${visitorName}`,
      body,
    });

    await db
      .update(visitorRequests)
      .set({ dispatched: true, dispatchedAt: new Date(), dispatchError: null })
      .where(eq(visitorRequests.id, req.id));

    await record({
      action: 'dispatch_visitor_request',
      ctx: { ip: req.ip ?? undefined, userAgent: req.userAgent ?? undefined },
      targetId: req.targetBibleTalkId,
    });
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'dispatch error';
    await db
      .update(visitorRequests)
      .set({ dispatchError: msg })
      .where(eq(visitorRequests.id, req.id));

    await record({
      action: 'dispatch_failure',
      ctx: { ip: req.ip ?? undefined, userAgent: req.userAgent ?? undefined },
      targetId: req.targetBibleTalkId ?? undefined,
      metadata: { error: msg },
    });
    return false;
  }
}

export async function redispatch(requestId: string, ctx: AdminContext): Promise<boolean> {
  void ctx;
  return dispatch(requestId);
}

import { record } from '../audit';
import { PLACEHOLDER_EMAIL } from '../constants';
import { send } from '../mail';
import { check as rateLimit } from '../rate-limit';
import { logSend } from '../repos/comms';
import { listPrivate } from '../repos/leaders';
import type { AdminContext } from '../types';

const SEND_LIMIT = 5;
const SEND_WINDOW_MS = 60 * 60 * 1000;

export class LocalSendDisabledError extends Error {
  constructor() {
    super('real sends are disabled on localhost');
  }
}

export class CommsRateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('rate limited');
  }
}

export class NoRecipientsError extends Error {
  constructor() {
    super('no recipients');
  }
}

export interface SendBlastInput {
  subject: string;
  body: string;
  includeInactive: boolean;
  testOnly: boolean;
  // Computed by the route from NODE_ENV + Host header. When true, only
  // testOnly sends are allowed — dev must never email the real leaders.
  isLocal: boolean;
}

export async function sendBlast(
  input: SendBlastInput,
  ctx: AdminContext,
): Promise<{ recipientCount: number; skippedCount: number }> {
  if (input.isLocal && !input.testOnly) throw new LocalSendDisabledError();

  const rl = rateLimit(`comms:${ctx.adminUserId}`, SEND_LIMIT, SEND_WINDOW_MS);
  if (!rl.ok) throw new CommsRateLimitedError(rl.retryAfterMs ?? SEND_WINDOW_MS);

  const leaders = await listPrivate(ctx);
  const eligible = input.includeInactive
    ? leaders
    : leaders.filter((l) => l.isActive);

  const emails = new Set<string>();
  let skippedCount = 0;
  for (const l of eligible) {
    if (!l.email || l.email === PLACEHOLDER_EMAIL) {
      skippedCount++;
      continue;
    }
    emails.add(l.email);
  }

  if (!input.testOnly && emails.size === 0) throw new NoRecipientsError();

  const selfAddress = process.env.GMAIL_SMTP_USER!;
  const subject = input.testOnly ? `[TEST] ${input.subject}` : input.subject;
  const recipientCount = input.testOnly ? 1 : emails.size;

  let status: 'sent' | 'failed' = 'sent';
  let error: string | null = null;
  try {
    const info = await send({
      to: input.testOnly ? ctx.email : selfAddress,
      bcc: input.testOnly ? undefined : Array.from(emails),
      subject,
      body: input.body,
    });
    const rejected = (info.rejected ?? []) as string[];
    const accepted = (info.accepted ?? []) as string[];
    if (accepted.length === 0) {
      status = 'failed';
      error = 'all recipients rejected by the mail server';
    } else if (rejected.length > 0) {
      error = `${rejected.length} recipient(s) rejected by the mail server`;
    }
  } catch (err) {
    status = 'failed';
    error = err instanceof Error ? err.message : 'send failed';
  }

  await logSend({
    subject: input.subject,
    body: input.body,
    recipientCount,
    skippedCount,
    includedInactive: input.includeInactive,
    isTest: input.testOnly,
    status,
    error,
    ctx,
  });
  await record({
    action: 'send_comms',
    ctx,
    metadata: {
      recipientCount,
      skippedCount,
      includedInactive: input.includeInactive,
      isTest: input.testOnly,
      status,
    },
  });

  if (status === 'failed') throw new Error(error ?? 'send failed');
  return { recipientCount, skippedCount };
}

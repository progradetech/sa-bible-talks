import { eq, inArray, and } from 'drizzle-orm';
import { adminUsers, bibleTalks, bibleTalksPii, db } from '@/db';
import { record } from '../audit';
import { PLACEHOLDER_EMAIL } from '../constants';
import { decryptField } from '../crypto';
import { send } from '../mail';
import { check as rateLimit } from '../rate-limit';
import { createClaim, hasPendingClaim } from '../repos/claims';
import type { AdminContext } from '../types';

const CLAIM_LIMIT = 3;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;

export class NotClaimableError extends Error {
  constructor(public readonly reason: string) {
    super(`not claimable: ${reason}`);
  }
}

export class ClaimRateLimitedError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super('rate limited');
  }
}

// A leader-role user asks to claim an unowned, email-less bible talk.
// Creates a pending claim and emails every active admin a one-click
// approval link.
export async function requestClaim(
  bibleTalkId: string,
  ctx: AdminContext,
  origin: string,
): Promise<void> {
  if (ctx.role !== 'leader') throw new NotClaimableError('not_leader');

  const rl = rateLimit(`claim:${ctx.adminUserId}`, CLAIM_LIMIT, CLAIM_WINDOW_MS);
  if (!rl.ok) throw new ClaimRateLimitedError(rl.retryAfterMs ?? CLAIM_WINDOW_MS);

  // One-to-one: a leader already managing a talk cannot claim another.
  const [ownTalk] = await db
    .select({ id: bibleTalks.id })
    .from(bibleTalks)
    .where(eq(bibleTalks.leaderAdminUserId, ctx.adminUserId))
    .limit(1);
  if (ownTalk) throw new NotClaimableError('already_linked');

  if (await hasPendingClaim(ctx.adminUserId)) {
    throw new NotClaimableError('claim_pending');
  }

  const [row] = await db
    .select()
    .from(bibleTalks)
    .leftJoin(bibleTalksPii, eq(bibleTalksPii.bibleTalkId, bibleTalks.id))
    .where(eq(bibleTalks.id, bibleTalkId))
    .limit(1);
  if (!row || !row.bible_talks_pii) throw new NotClaimableError('not_found');
  if (row.bible_talks.leaderAdminUserId !== null) {
    throw new NotClaimableError('talk_linked');
  }
  const talkEmail = await decryptField(row.bible_talks_pii.emailEnc, bibleTalkId);
  if (talkEmail && talkEmail !== PLACEHOLDER_EMAIL) {
    throw new NotClaimableError('talk_has_email');
  }
  const talkName = await decryptField(row.bible_talks_pii.nameEnc, bibleTalkId);

  const { token } = await createClaim(bibleTalkId, ctx);
  await record({
    action: 'leader_claim_requested',
    ctx,
    targetId: bibleTalkId,
    metadata: { leaderEmail: ctx.email },
  });

  const staff = await db
    .select({ email: adminUsers.email })
    .from(adminUsers)
    .where(
      and(
        inArray(adminUsers.role, ['admin', 'super_admin']),
        eq(adminUsers.isActive, true),
      ),
    );

  const approveUrl = `${origin}/admin/claims/approve?token=${token}`;
  const talk = row.bible_talks;
  const body =
    `A bible talk leader is requesting to claim a bible talk on the map.\n\n` +
    `Leader account: ${ctx.email}\n` +
    `Bible talk: ${talkName} (${talk.ministry}${talk.groupName ? ` — ${talk.groupName}` : ''})\n\n` +
    `To approve, open this link while signed in as an admin:\n${approveUrl}\n\n` +
    `Approving links this leader to the bible talk and sets its contact ` +
    `email to ${ctx.email}. Only the first admin to approve takes effect.`;

  await send({
    to: process.env.GMAIL_SMTP_USER!,
    bcc: staff.map((s) => s.email),
    subject: `Bible talk claim request from ${ctx.email}`,
    body,
  });
}

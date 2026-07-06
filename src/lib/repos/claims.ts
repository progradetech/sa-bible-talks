import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { adminUsers, bibleTalks, bibleTalksPii, db, leaderClaims } from '@/db';
import { record } from '../audit';
import { encryptField } from '../crypto';
import type { AdminContext } from '../types';

export interface ClaimApprovalResult {
  outcome: 'approved' | 'already_handled' | 'not_found' | 'talk_already_linked';
  leaderEmail?: string;
  talkId?: string;
  approvedAt?: string;
}

export async function createClaim(
  bibleTalkId: string,
  ctx: AdminContext,
): Promise<{ id: string; token: string }> {
  const token = randomBytes(32).toString('hex');
  const [row] = await db
    .insert(leaderClaims)
    .values({ bibleTalkId, leaderAdminUserId: ctx.adminUserId, token })
    .returning({ id: leaderClaims.id });
  return { id: row.id, token };
}

export async function hasPendingClaim(adminUserId: string): Promise<boolean> {
  const rows = await db
    .select({ id: leaderClaims.id })
    .from(leaderClaims)
    .where(
      and(
        eq(leaderClaims.leaderAdminUserId, adminUserId),
        eq(leaderClaims.status, 'pending'),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// One-time approval: the atomic status flip (UPDATE ... WHERE status =
// 'pending') guarantees exactly one admin's click wins; later clicks land in
// 'already_handled'. If the talk was linked by other means while the claim
// sat pending, the claim is marked 'rejected' so the leader can claim again.
export async function approveClaim(
  token: string,
  ctx: AdminContext,
): Promise<ClaimApprovalResult> {
  const [existing] = await db
    .select()
    .from(leaderClaims)
    .where(eq(leaderClaims.token, token))
    .limit(1);
  if (!existing) return { outcome: 'not_found' };

  const result = await db.transaction(async (tx): Promise<ClaimApprovalResult> => {
    const [claim] = await tx
      .update(leaderClaims)
      .set({ status: 'approved', approvedBy: ctx.adminUserId, approvedAt: new Date() })
      .where(and(eq(leaderClaims.token, token), eq(leaderClaims.status, 'pending')))
      .returning();
    if (!claim) {
      return {
        outcome: 'already_handled',
        approvedAt: existing.approvedAt?.toISOString(),
      };
    }

    // The talk may have been linked by other means since the claim was filed.
    const [talk] = await tx
      .select({ leaderAdminUserId: bibleTalks.leaderAdminUserId })
      .from(bibleTalks)
      .where(eq(bibleTalks.id, claim.bibleTalkId))
      .limit(1);
    const [leader] = await tx
      .select({ id: adminUsers.id, email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.id, claim.leaderAdminUserId))
      .limit(1);

    if (!talk || !leader || talk.leaderAdminUserId !== null) {
      await tx
        .update(leaderClaims)
        .set({ status: 'rejected' })
        .where(eq(leaderClaims.id, claim.id));
      return { outcome: !talk || !leader ? 'not_found' : 'talk_already_linked' };
    }

    await tx
      .update(bibleTalks)
      .set({ leaderAdminUserId: claim.leaderAdminUserId, updatedAt: new Date() })
      .where(eq(bibleTalks.id, claim.bibleTalkId));

    await tx
      .update(bibleTalksPii)
      .set({
        emailEnc: await encryptField(leader.email, claim.bibleTalkId),
        updatedAt: new Date(),
      })
      .where(eq(bibleTalksPii.bibleTalkId, claim.bibleTalkId));

    return { outcome: 'approved', leaderEmail: leader.email, talkId: claim.bibleTalkId };
  });

  if (result.outcome === 'approved') {
    await record({
      action: 'leader_claim_approved',
      ctx,
      targetId: result.talkId,
      metadata: { leaderEmail: result.leaderEmail },
    });
  }
  return result;
}

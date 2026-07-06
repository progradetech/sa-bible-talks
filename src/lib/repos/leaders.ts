import { and, eq } from 'drizzle-orm';
import { adminUsers, bibleTalks, bibleTalksPii, db } from '@/db';
import { record } from '../audit';
import { PLACEHOLDER_EMAIL } from '../constants';
import { decryptField, encryptField, getKeyVersion } from '../crypto';
import { jitter } from '../jitter';
import type {
  AdminContext,
  CreateLeaderInput,
  Language,
  MapLeader,
  Ministry,
  PrivateLeader,
  PublicLeader,
  UpdateLeaderInput,
} from '../types';

const DEFAULT_JITTER_MILES = 1.5;

function toPublic(row: typeof bibleTalks.$inferSelect): PublicLeader {
  return {
    id: row.id,
    ministry: row.ministry as Ministry,
    language: row.language as Language,
    kidFriendly: row.kidFriendly,
    meetingInfo: row.meetingInfo,
    groupName: row.showGroupName ? row.groupName : null,
    approxLat: row.approxLat,
    approxLng: row.approxLng,
    jitterMiles: row.jitterMiles ? Number(row.jitterMiles) : null,
  };
}

export async function listPublic(): Promise<PublicLeader[]> {
  const rows = await db
    .select()
    .from(bibleTalks)
    .where(
      and(
        eq(bibleTalks.isActive, true),
        eq(bibleTalks.hideFromPublicMap, false),
        eq(bibleTalks.isPaused, false),
      ),
    );

  return rows.map(toPublic);
}

export async function listPrivate(ctx: AdminContext): Promise<PrivateLeader[]> {
  const rows = await db
    .select()
    .from(bibleTalks)
    .leftJoin(bibleTalksPii, eq(bibleTalksPii.bibleTalkId, bibleTalks.id));

  await record({ action: 'view_pii_list', ctx });

  return Promise.all(
    rows.map(async ({ bible_talks: talk, bible_talks_pii: pii }) => {
      if (!pii) throw new Error(`pii row missing for bible_talk ${talk.id}`);

      const [name, address, email, phone, adminNotes, exactLat, exactLng] = await Promise.all([
        decryptField(pii.nameEnc, talk.id),
        decryptField(pii.addressEnc, talk.id),
        decryptField(pii.emailEnc, talk.id),
        pii.phoneEnc ? decryptField(pii.phoneEnc, talk.id) : Promise.resolve(null),
        pii.adminNotesEnc ? decryptField(pii.adminNotesEnc, talk.id) : Promise.resolve(null),
        decryptField(pii.exactLatEnc, talk.id),
        decryptField(pii.exactLngEnc, talk.id),
      ]);

      return {
        ...toPublic(talk),
        groupName: talk.groupName,
        showGroupName: talk.showGroupName,
        name,
        address,
        email,
        phone,
        adminNotes,
        exactLat: Number(exactLat),
        exactLng: Number(exactLng),
        hideFromPublicMap: talk.hideFromPublicMap,
        isPaused: talk.isPaused,
        isActive: talk.isActive,
        leaderAdminUserId: talk.leaderAdminUserId,
      };
    }),
  );
}

function hasRealEmail(email: string): boolean {
  return !!email && email !== PLACEHOLDER_EMAIL;
}

// Role-aware payload for the admin map dashboard. Staff get every talk with
// full PII plus the linked leader's account email. A leader-role viewer gets
// full PII only for their own talk; every other talk is redacted server-side
// (blank PII, approx coords in the exact-coord slots) and limited to
// publicly-visible talks — except the leader's name, which signed-in leaders
// are allowed to see.
export async function listForMap(ctx: AdminContext): Promise<MapLeader[]> {
  if (ctx.role !== 'leader') {
    const [all, admins] = await Promise.all([
      listPrivate(ctx),
      db.select({ id: adminUsers.id, email: adminUsers.email }).from(adminUsers),
    ]);
    const emailById = new Map(admins.map((a) => [a.id, a.email]));
    return all.map((l) => ({
      ...l,
      isOwn: false,
      redacted: false,
      claimable: false,
      linkedLeaderEmail: l.leaderAdminUserId
        ? (emailById.get(l.leaderAdminUserId) ?? null)
        : null,
    }));
  }

  const rows = await db
    .select()
    .from(bibleTalks)
    .leftJoin(bibleTalksPii, eq(bibleTalksPii.bibleTalkId, bibleTalks.id));

  const leaderIsLinked = rows.some(
    ({ bible_talks: talk }) => talk.leaderAdminUserId === ctx.adminUserId,
  );

  const result: MapLeader[] = [];
  for (const { bible_talks: talk, bible_talks_pii: pii } of rows) {
    if (!pii) throw new Error(`pii row missing for bible_talk ${talk.id}`);
    const isOwn = talk.leaderAdminUserId === ctx.adminUserId;

    if (isOwn) {
      const [name, address, email, phone, exactLat, exactLng] = await Promise.all([
        decryptField(pii.nameEnc, talk.id),
        decryptField(pii.addressEnc, talk.id),
        decryptField(pii.emailEnc, talk.id),
        pii.phoneEnc ? decryptField(pii.phoneEnc, talk.id) : Promise.resolve(null),
        decryptField(pii.exactLatEnc, talk.id),
        decryptField(pii.exactLngEnc, talk.id),
      ]);
      await record({ action: 'view_pii_single', ctx, targetId: talk.id });
      result.push({
        ...toPublic(talk),
        groupName: talk.groupName,
        showGroupName: talk.showGroupName,
        name,
        address,
        email,
        phone,
        adminNotes: null, // never sent to leaders, even for their own talk
        exactLat: Number(exactLat),
        exactLng: Number(exactLng),
        hideFromPublicMap: talk.hideFromPublicMap,
        isPaused: talk.isPaused,
        isActive: talk.isActive,
        leaderAdminUserId: talk.leaderAdminUserId,
        isOwn: true,
        redacted: false,
        claimable: false,
        linkedLeaderEmail: null,
      });
      continue;
    }

    // Other talks: only publicly-visible ones, redacted except the name.
    if (!talk.isActive || talk.hideFromPublicMap || talk.isPaused) continue;
    const [name, email] = await Promise.all([
      decryptField(pii.nameEnc, talk.id),
      decryptField(pii.emailEnc, talk.id),
    ]);
    result.push({
      ...toPublic(talk),
      showGroupName: talk.showGroupName,
      name,
      address: '',
      email: '',
      phone: null,
      adminNotes: null,
      exactLat: talk.approxLat,
      exactLng: talk.approxLng,
      hideFromPublicMap: talk.hideFromPublicMap,
      isPaused: talk.isPaused,
      isActive: talk.isActive,
      leaderAdminUserId: null,
      isOwn: false,
      redacted: true,
      claimable:
        !leaderIsLinked && talk.leaderAdminUserId === null && !hasRealEmail(email),
      linkedLeaderEmail: null,
    });
  }
  return result;
}

// Decrypt-scan contact emails to find the talk matching an invited leader's
// email. Only unlinked talks qualify. Used once at invite time.
export async function findTalkIdByEmail(email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(bibleTalks)
    .leftJoin(bibleTalksPii, eq(bibleTalksPii.bibleTalkId, bibleTalks.id));

  for (const { bible_talks: talk, bible_talks_pii: pii } of rows) {
    if (!pii || talk.leaderAdminUserId !== null) continue;
    const talkEmail = await decryptField(pii.emailEnc, talk.id);
    if (hasRealEmail(talkEmail) && talkEmail.trim().toLowerCase() === target) {
      return talk.id;
    }
  }
  return null;
}

// Link or unlink a leader account to a talk. Unlinking with
// resetEmailToPlaceholder also resets the talk's contact email to the
// placeholder ("no email" convention) — the admin "Remove leader" action.
export async function setLeaderLink(
  talkId: string,
  leaderAdminUserId: string | null,
  ctx: AdminContext,
  opts: { resetEmailToPlaceholder?: boolean } = {},
): Promise<void> {
  await db
    .update(bibleTalks)
    .set({ leaderAdminUserId, updatedAt: new Date() })
    .where(eq(bibleTalks.id, talkId));

  if (leaderAdminUserId === null && opts.resetEmailToPlaceholder) {
    await db
      .update(bibleTalksPii)
      .set({
        emailEnc: await encryptField(PLACEHOLDER_EMAIL, talkId),
        updatedAt: new Date(),
      })
      .where(eq(bibleTalksPii.bibleTalkId, talkId));
  }

  await record({
    action: leaderAdminUserId ? 'leader_linked' : 'leader_unlinked',
    ctx,
    targetId: talkId,
    metadata: { leaderAdminUserId },
  });
}

export async function getPrivate(id: string, ctx: AdminContext): Promise<PrivateLeader | null> {
  const all = await listPrivate(ctx);
  await record({ action: 'view_pii_single', ctx, targetId: id });
  return all.find((l) => l.id === id) ?? null;
}

export async function create(input: CreateLeaderInput, ctx: AdminContext): Promise<string> {
  const jitterMiles = input.jitterMiles ?? DEFAULT_JITTER_MILES;
  const approx = jitter(input.exactLat, input.exactLng, jitterMiles);

  const [talk] = await db
    .insert(bibleTalks)
    .values({
      ministry: input.ministry,
      meetingInfo: input.meetingInfo,
      language: input.language,
      kidFriendly: input.kidFriendly,
      groupName: input.groupName,
      showGroupName: input.showGroupName,
      approxLat: approx.lat,
      approxLng: approx.lng,
      jitterMiles: input.jitterMiles?.toString(),
    })
    .returning();

  const keyVersion = getKeyVersion();
  const [
    nameEnc,
    addressEnc,
    emailEnc,
    phoneEnc,
    adminNotesEnc,
    exactLatEnc,
    exactLngEnc,
  ] = await Promise.all([
    encryptField(input.name, talk.id),
    encryptField(input.address, talk.id),
    encryptField(input.email, talk.id),
    input.phone ? encryptField(input.phone, talk.id) : Promise.resolve(null),
    input.adminNotes ? encryptField(input.adminNotes, talk.id) : Promise.resolve(null),
    encryptField(input.exactLat.toString(), talk.id),
    encryptField(input.exactLng.toString(), talk.id),
  ]);

  await db.insert(bibleTalksPii).values({
    bibleTalkId: talk.id,
    nameEnc,
    addressEnc,
    emailEnc,
    phoneEnc,
    adminNotesEnc,
    exactLatEnc,
    exactLngEnc,
    keyVersion,
  });

  await record({ action: 'create_leader', ctx, targetId: talk.id });
  return talk.id;
}

export async function update(
  id: string,
  input: UpdateLeaderInput,
  ctx: AdminContext,
): Promise<void> {
  // Public columns
  const publicUpdates: Partial<typeof bibleTalks.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.ministry !== undefined) publicUpdates.ministry = input.ministry;
  if (input.meetingInfo !== undefined)
    publicUpdates.meetingInfo = input.meetingInfo || null;
  if (input.language !== undefined) publicUpdates.language = input.language;
  if (input.kidFriendly !== undefined) publicUpdates.kidFriendly = input.kidFriendly;
  if (input.groupName !== undefined) publicUpdates.groupName = input.groupName || null;
  if (input.showGroupName !== undefined) publicUpdates.showGroupName = input.showGroupName;
  if (input.hideFromPublicMap !== undefined)
    publicUpdates.hideFromPublicMap = input.hideFromPublicMap;
  if (input.isPaused !== undefined) publicUpdates.isPaused = input.isPaused;
  if (input.isActive !== undefined) publicUpdates.isActive = input.isActive;
  if (input.jitterMiles !== undefined)
    publicUpdates.jitterMiles =
      input.jitterMiles !== null ? input.jitterMiles?.toString() : null;

  // Re-jitter approx coords when exact coords change. Use new jitterMiles if
  // provided, else fall back to default (1.5).
  if (input.exactLat !== undefined && input.exactLng !== undefined) {
    const miles = input.jitterMiles ?? DEFAULT_JITTER_MILES;
    const approx = jitter(input.exactLat, input.exactLng, miles);
    publicUpdates.approxLat = approx.lat;
    publicUpdates.approxLng = approx.lng;
  }

  await db.update(bibleTalks).set(publicUpdates).where(eq(bibleTalks.id, id));

  // PII columns — encrypt with the row id as AAD so the ciphertext stays
  // bound to this leader's record.
  const piiUpdates: Partial<typeof bibleTalksPii.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) piiUpdates.nameEnc = await encryptField(input.name, id);
  if (input.address !== undefined)
    piiUpdates.addressEnc = await encryptField(input.address, id);
  if (input.email !== undefined) piiUpdates.emailEnc = await encryptField(input.email, id);
  if (input.phone !== undefined) {
    piiUpdates.phoneEnc = input.phone ? await encryptField(input.phone, id) : null;
  }
  if (input.adminNotes !== undefined) {
    piiUpdates.adminNotesEnc = input.adminNotes
      ? await encryptField(input.adminNotes, id)
      : null;
  }
  if (input.exactLat !== undefined) {
    piiUpdates.exactLatEnc = await encryptField(input.exactLat.toString(), id);
  }
  if (input.exactLng !== undefined) {
    piiUpdates.exactLngEnc = await encryptField(input.exactLng.toString(), id);
  }

  // Only run the PII update when something other than updatedAt changed.
  if (Object.keys(piiUpdates).length > 1) {
    await db
      .update(bibleTalksPii)
      .set(piiUpdates)
      .where(eq(bibleTalksPii.bibleTalkId, id));
  }

  await record({ action: 'update_leader', ctx, targetId: id });
}

export async function remove(id: string, ctx: AdminContext): Promise<void> {
  // CASCADE deletes bible_talks_pii. audit_log retains depersonalized stub
  // because admin_user_id is captured at write-time and actor_email is
  // snapshotted by the audit module.
  await db.delete(bibleTalks).where(eq(bibleTalks.id, id));
  await record({ action: 'delete_leader', ctx, targetId: id });
}

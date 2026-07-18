import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { auditAction, bibleTalks, careEntries, db } from '@/db';
import { record } from '../audit';
import { ARCHIVED_STAGE, initialStage, type CareType } from '../care-stages';
import { decryptField, encryptField, getKeyVersion } from '../crypto';
import type {
  AdminContext,
  CareEntry,
  CareTalkOption,
  CreateCareEntryInput,
  UpdateCareEntryInput,
} from '../types';

async function toEntry(row: typeof careEntries.$inferSelect): Promise<CareEntry> {
  const [personName, contact, details, outcome] = await Promise.all([
    row.personNameEnc ? decryptField(row.personNameEnc, row.id) : Promise.resolve(null),
    row.contactEnc ? decryptField(row.contactEnc, row.id) : Promise.resolve(null),
    row.detailsEnc ? decryptField(row.detailsEnc, row.id) : Promise.resolve(null),
    row.outcomeEnc ? decryptField(row.outcomeEnc, row.id) : Promise.resolve(null),
  ]);

  return {
    id: row.id,
    bibleTalkId: row.bibleTalkId,
    type: row.type,
    stage: row.stage,
    personName,
    contact,
    details,
    outcome,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export async function listForTalk(
  talkId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<CareEntry[]> {
  const rows = await db
    .select()
    .from(careEntries)
    .where(
      opts.includeArchived
        ? eq(careEntries.bibleTalkId, talkId)
        : and(eq(careEntries.bibleTalkId, talkId), isNull(careEntries.archivedAt)),
    )
    .orderBy(desc(careEntries.createdAt));

  return Promise.all(rows.map(toEntry));
}

export interface ListAllOpts {
  talkId?: string;
  type?: CareType;
  stage?: string;
  unassigned?: boolean;
  includeArchived?: boolean;
}

export async function listAll(opts: ListAllOpts = {}): Promise<CareEntry[]> {
  const conditions = [];
  if (opts.unassigned) {
    conditions.push(isNull(careEntries.bibleTalkId));
  } else if (opts.talkId) {
    conditions.push(eq(careEntries.bibleTalkId, opts.talkId));
  }
  if (opts.type) conditions.push(eq(careEntries.type, opts.type));
  if (opts.stage) conditions.push(eq(careEntries.stage, opts.stage));
  if (!opts.includeArchived) conditions.push(isNull(careEntries.archivedAt));

  const rows = await db
    .select()
    .from(careEntries)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(careEntries.createdAt));

  return Promise.all(rows.map(toEntry));
}

export interface TalkCareCounts {
  bibleTalkId: string | null;
  talkLabel: string;
  total: number;
}

// Active-entry totals grouped by talk, for the staff aggregate view's
// summary row. bibleTalkId null = the Unassigned bucket.
export async function countsByTalk(): Promise<TalkCareCounts[]> {
  const rows = await db
    .select({
      bibleTalkId: careEntries.bibleTalkId,
      ministry: bibleTalks.ministry,
      groupName: bibleTalks.groupName,
      total: count(),
    })
    .from(careEntries)
    .leftJoin(bibleTalks, eq(bibleTalks.id, careEntries.bibleTalkId))
    .where(isNull(careEntries.archivedAt))
    .groupBy(careEntries.bibleTalkId, bibleTalks.ministry, bibleTalks.groupName);

  return rows
    .map((r) => ({
      bibleTalkId: r.bibleTalkId,
      talkLabel: r.bibleTalkId ? r.groupName || r.ministry || 'Unnamed talk' : 'Unassigned',
      total: Number(r.total),
    }))
    .sort((a, b) => a.talkLabel.localeCompare(b.talkLabel));
}

export async function getScopeInfo(
  id: string,
): Promise<{ bibleTalkId: string | null; type: (typeof careEntries.$inferSelect)['type'] } | null> {
  const [row] = await db
    .select({ bibleTalkId: careEntries.bibleTalkId, type: careEntries.type })
    .from(careEntries)
    .where(eq(careEntries.id, id))
    .limit(1);
  return row ?? null;
}

export async function create(input: CreateCareEntryInput, ctx: AdminContext): Promise<string> {
  const stage = input.stage ?? initialStage(input.type);

  const [entry] = await db
    .insert(careEntries)
    .values({
      bibleTalkId: input.bibleTalkId ?? null,
      type: input.type,
      stage,
      createdBy: ctx.adminUserId,
    })
    .returning();

  const keyVersion = getKeyVersion();
  const [personNameEnc, contactEnc, detailsEnc] = await Promise.all([
    input.personName ? encryptField(input.personName, entry.id) : Promise.resolve(null),
    input.contact ? encryptField(input.contact, entry.id) : Promise.resolve(null),
    input.details ? encryptField(input.details, entry.id) : Promise.resolve(null),
  ]);

  if (personNameEnc || contactEnc || detailsEnc) {
    await db
      .update(careEntries)
      .set({ personNameEnc, contactEnc, detailsEnc, keyVersion })
      .where(eq(careEntries.id, entry.id));
  }

  await record({ action: auditAction.CARE_ENTRY_CREATED, ctx, targetId: entry.id });
  return entry.id;
}

export async function update(
  id: string,
  input: UpdateCareEntryInput,
  ctx: AdminContext,
): Promise<void> {
  const updates: Partial<typeof careEntries.$inferInsert> = { updatedAt: new Date() };
  let stageChanged = false;
  let archiving = false;
  const assigning = input.bibleTalkId !== undefined;

  if (input.bibleTalkId !== undefined) updates.bibleTalkId = input.bibleTalkId;
  if (input.stage !== undefined) {
    updates.stage = input.stage;
    stageChanged = true;
    if (input.stage === ARCHIVED_STAGE) {
      updates.archivedAt = new Date();
      archiving = true;
    } else {
      updates.archivedAt = null;
    }
  }
  if (input.personName !== undefined) {
    updates.personNameEnc = input.personName ? await encryptField(input.personName, id) : null;
  }
  if (input.contact !== undefined) {
    updates.contactEnc = input.contact ? await encryptField(input.contact, id) : null;
  }
  if (input.details !== undefined) {
    updates.detailsEnc = input.details ? await encryptField(input.details, id) : null;
  }
  if (input.outcome !== undefined) {
    updates.outcomeEnc = input.outcome ? await encryptField(input.outcome, id) : null;
  }

  await db.update(careEntries).set(updates).where(eq(careEntries.id, id));

  await record({
    action: archiving
      ? auditAction.CARE_ENTRY_ARCHIVED
      : stageChanged
        ? auditAction.CARE_ENTRY_STAGE_CHANGED
        : assigning
          ? auditAction.CARE_ENTRY_ASSIGNED
          : auditAction.CARE_ENTRY_UPDATED,
    ctx,
    targetId: id,
  });
}

export async function remove(id: string, ctx: AdminContext): Promise<void> {
  await db.delete(careEntries).where(eq(careEntries.id, id));
  await record({ action: auditAction.CARE_ENTRY_DELETED, ctx, targetId: id });
}

// Every talk (including paused/hidden ones), for the staff talk filter and
// assignment dropdowns — care work isn't limited to publicly-visible talks.
export async function listTalkOptions(): Promise<CareTalkOption[]> {
  const rows = await db
    .select({ id: bibleTalks.id, ministry: bibleTalks.ministry, groupName: bibleTalks.groupName })
    .from(bibleTalks);

  return rows
    .map((r) => ({ id: r.id, label: r.groupName || r.ministry }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export async function talkExists(talkId: string): Promise<boolean> {
  const [talk] = await db
    .select({ id: bibleTalks.id })
    .from(bibleTalks)
    .where(eq(bibleTalks.id, talkId))
    .limit(1);
  return !!talk;
}

// Resolves the talk a leader account owns, for scoping care-page requests.
export async function findOwnTalkId(adminUserId: string): Promise<string | null> {
  const [talk] = await db
    .select({ id: bibleTalks.id })
    .from(bibleTalks)
    .where(eq(bibleTalks.leaderAdminUserId, adminUserId))
    .limit(1);
  return talk?.id ?? null;
}

import { asc, count, desc, eq } from 'drizzle-orm';
import { commsLog, db, messageTemplates } from '@/db';
import type { AdminContext } from '../types';

export interface MessageTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  updatedAt: string;
}

export interface CommsLogEntry {
  id: string;
  subject: string;
  recipientCount: number;
  skippedCount: number;
  includedInactive: boolean;
  isTest: boolean;
  sentByEmail: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
}

export async function listTemplates(): Promise<MessageTemplate[]> {
  const rows = await db
    .select()
    .from(messageTemplates)
    .orderBy(asc(messageTemplates.name));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    body: r.body,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createTemplate(
  input: TemplateInput,
  ctx: AdminContext,
): Promise<string> {
  const [row] = await db
    .insert(messageTemplates)
    .values({
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      updatedBy: ctx.adminUserId,
    })
    .returning({ id: messageTemplates.id });
  return row.id;
}

export async function updateTemplate(
  id: string,
  input: TemplateInput,
  ctx: AdminContext,
): Promise<boolean> {
  const rows = await db
    .update(messageTemplates)
    .set({
      name: input.name.trim(),
      subject: input.subject.trim(),
      body: input.body.trim(),
      updatedBy: ctx.adminUserId,
      updatedAt: new Date(),
    })
    .where(eq(messageTemplates.id, id))
    .returning({ id: messageTemplates.id });
  return rows.length > 0;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const rows = await db
    .delete(messageTemplates)
    .where(eq(messageTemplates.id, id))
    .returning({ id: messageTemplates.id });
  return rows.length > 0;
}

export async function listLog(
  page = 1,
  pageSize = 50,
): Promise<{ entries: CommsLogEntry[]; total: number; page: number; pageSize: number }> {
  const safePage = Math.max(1, page);
  const [rows, [{ value: total }]] = await Promise.all([
    db
      .select()
      .from(commsLog)
      .orderBy(desc(commsLog.createdAt))
      .limit(pageSize)
      .offset((safePage - 1) * pageSize),
    db.select({ value: count() }).from(commsLog),
  ]);
  return {
    entries: rows.map((r) => ({
      id: r.id,
      subject: r.subject,
      recipientCount: r.recipientCount,
      skippedCount: r.skippedCount,
      includedInactive: r.includedInactive,
      isTest: r.isTest,
      sentByEmail: r.sentByEmail,
      status: r.status,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page: safePage,
    pageSize,
  };
}

export async function logSend(entry: {
  subject: string;
  body: string;
  recipientCount: number;
  skippedCount: number;
  includedInactive: boolean;
  isTest: boolean;
  status: 'sent' | 'failed';
  error?: string | null;
  ctx: AdminContext;
}): Promise<void> {
  await db.insert(commsLog).values({
    subject: entry.subject,
    body: entry.body,
    recipientCount: entry.recipientCount,
    skippedCount: entry.skippedCount,
    includedInactive: entry.includedInactive,
    isTest: entry.isTest,
    sentBy: entry.ctx.adminUserId,
    sentByEmail: entry.ctx.email,
    status: entry.status,
    error: entry.error ?? null,
  });
}

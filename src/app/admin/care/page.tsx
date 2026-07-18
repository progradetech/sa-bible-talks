import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { bibleTalks, db } from '@/db';
import { getAdminContext } from '@/lib/auth';
import { isCareType } from '@/lib/care-stages';
import { countsByTalk, findOwnTalkId, listAll, listForTalk, listTalkOptions } from '@/lib/repos/care';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { CarePanel } from '@/components/admin/CarePanel';
import { StaffCarePanel } from '@/components/admin/StaffCarePanel';
import type { CareEntry } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Care — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ talk?: string; type?: string; stage?: string; archived?: string }>;
}

function toRow(e: CareEntry, talkLabel?: string) {
  return {
    id: e.id,
    type: e.type,
    stage: e.stage,
    personName: e.personName,
    contact: e.contact,
    details: e.details,
    outcome: e.outcome,
    createdAt: e.createdAt.toISOString(),
    archivedAt: e.archivedAt ? e.archivedAt.toISOString() : null,
    bibleTalkId: e.bibleTalkId,
    ...(talkLabel !== undefined ? { talkLabel } : {}),
  };
}

function EmptyState({
  ctx,
  message,
}: {
  ctx: { email: string; role: 'super_admin' | 'admin' | 'leader' };
  message: string;
}) {
  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/care" />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">Care</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        </div>
      </main>
    </div>
  );
}

export default async function CarePage({ searchParams }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  if (ctx.role !== 'leader') {
    const params = await searchParams;
    const talkParam = params.talk ?? '';
    const typeParam = isCareType(params.type) ? params.type : undefined;
    const includeArchived = params.archived === '1';

    const [talkOptions, counts, entries] = await Promise.all([
      listTalkOptions(),
      countsByTalk(),
      listAll({
        talkId: talkParam && talkParam !== 'unassigned' ? talkParam : undefined,
        unassigned: talkParam === 'unassigned',
        type: typeParam,
        stage: typeParam ? params.stage || undefined : undefined,
        includeArchived,
      }),
    ]);

    const talkLabelById = new Map(talkOptions.map((t) => [t.id, t.label]));
    const rows = entries.map((e) =>
      toRow(e, e.bibleTalkId ? (talkLabelById.get(e.bibleTalkId) ?? 'Unknown talk') : 'Unassigned'),
    );

    return (
      <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
        <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/care" />
        <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">Care</h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Prayer requests, interested people, potential move-ins, and restores across every
              bible talk.
            </p>

            <StaffCarePanel
              rows={rows}
              talkOptions={talkOptions}
              counts={counts}
              filters={{
                talk: talkParam,
                type: typeParam ?? '',
                stage: params.stage ?? '',
                archived: includeArchived,
              }}
            />
          </div>
        </main>
      </div>
    );
  }

  const talkId = await findOwnTalkId(ctx.adminUserId);

  if (!talkId) {
    return (
      <EmptyState
        ctx={ctx}
        message="No bible talk is linked to your account yet. Claim a talk from the map page to start tracking care items."
      />
    );
  }

  const [talk, entries] = await Promise.all([
    db
      .select({ ministry: bibleTalks.ministry, groupName: bibleTalks.groupName })
      .from(bibleTalks)
      .where(eq(bibleTalks.id, talkId))
      .limit(1)
      .then((rows) => rows[0]),
    listForTalk(talkId, { includeArchived: true }),
  ]);

  const rows = entries.map((e) => toRow(e));

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/care" />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">Care</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Prayer requests, interested people, potential move-ins, and restores for{' '}
            {talk?.groupName || talk?.ministry || 'your bible talk'}.
          </p>

          <CarePanel initialRows={rows} />
        </div>
      </main>
    </div>
  );
}

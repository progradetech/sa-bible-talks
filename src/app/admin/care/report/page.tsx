import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { isCareType } from '@/lib/care-stages';
import { countsByTalkAndType, listAll, listTalkOptions } from '@/lib/repos/care';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { CareReportPanel } from '@/components/admin/CareReportPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Care Report — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ talk?: string; type?: string; stage?: string; archived?: string }>;
}

export default async function CareReportPage({ searchParams }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (ctx.role === 'leader') redirect('/admin/care');

  const params = await searchParams;
  const talkParam = params.talk ?? '';
  const typeParam = isCareType(params.type) ? params.type : undefined;
  const includeArchived = params.archived === '1';

  const [talkOptions, matrix, entries] = await Promise.all([
    listTalkOptions(),
    countsByTalkAndType(),
    listAll({
      talkId: talkParam && talkParam !== 'unassigned' ? talkParam : undefined,
      unassigned: talkParam === 'unassigned',
      type: typeParam,
      stage: typeParam ? params.stage || undefined : undefined,
      includeArchived,
    }),
  ]);

  const talkLabelById = new Map(talkOptions.map((t) => [t.id, t.label]));
  const rows = entries.map((e) => ({
    id: e.id,
    talkLabel: e.bibleTalkId
      ? (talkLabelById.get(e.bibleTalkId) ?? 'Unknown talk')
      : 'Unassigned',
    type: e.type,
    stage: e.stage,
    personName: e.personName,
    contact: e.contact,
    details: e.details,
    outcome: e.outcome,
    createdAt: e.createdAt.toISOString(),
    archivedAt: e.archivedAt ? e.archivedAt.toISOString() : null,
  }));

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/care" />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
            Care Report
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Tabular views over all care entries, filterable and exportable.
          </p>

          <CareReportPanel
            rows={rows}
            matrix={matrix}
            talkOptions={talkOptions}
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

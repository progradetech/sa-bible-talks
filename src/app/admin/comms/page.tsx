import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { PLACEHOLDER_EMAIL } from '@/lib/constants';
import { listLog, listTemplates } from '@/lib/repos/comms';
import { listPrivate } from '@/lib/repos/leaders';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { CommsPanel } from '@/components/admin/CommsPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Communications — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ hpage?: string }>;
}

export default async function CommsPage({ searchParams }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const params = await searchParams;
  const historyPage = params.hpage ? Math.max(1, parseInt(params.hpage, 10) || 1) : 1;

  const [leaders, templates, log] = await Promise.all([
    listPrivate(ctx),
    listTemplates(),
    listLog(historyPage, 50),
  ]);

  // Only counts reach the client — never the decrypted emails themselves.
  const reachable = leaders.filter((l) => l.email && l.email !== PLACEHOLDER_EMAIL);
  const allCount = new Set(reachable.map((l) => l.email)).size;
  const activeCount = new Set(
    reachable.filter((l) => l.isActive).map((l) => l.email),
  ).size;

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/comms" />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
            Communications
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Email all bible talk leaders at once. Recipients are BCC&apos;d so
            they never see each other&apos;s addresses.
          </p>

          <CommsPanel
            templates={templates}
            log={log.entries}
            logTotal={log.total}
            logPage={log.page}
            logPageSize={log.pageSize}
            activeCount={activeCount}
            allCount={allCount}
          />
        </div>
      </main>
    </div>
  );
}

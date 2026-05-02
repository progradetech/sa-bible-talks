import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { listAudit, listDistinctActions } from '@/lib/repos/audit';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AuditTable } from '@/components/admin/AuditTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Audit log — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{
    page?: string;
    action?: string;
    actor?: string;
  }>;
}

export default async function AuditPage({ searchParams }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const params = await searchParams;
  const isSuperAdmin = ctx.role === 'super_admin';

  const result = await listAudit({
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 50,
    action: params.action,
    actorEmail: isSuperAdmin ? params.actor : undefined,
    // Plain admin sees only own entries.
    scopeToAdminUserId: isSuperAdmin ? undefined : ctx.adminUserId,
  });

  const actions = await listDistinctActions();

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/audit" />
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
            Audit log
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            {isSuperAdmin
              ? 'Every admin action across all users.'
              : 'Your activity. Super-admins see everyone.'}{' '}
            Auto-purged after 2 years.
          </p>

          <AuditTable
            entries={result.entries}
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            actions={actions}
            canFilterByActor={isSuperAdmin}
          />
        </div>
      </main>
    </div>
  );
}

import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { listAdmins } from '@/lib/repos/admins';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { AdminInviteForm } from '@/components/admin/AdminInviteForm';
import { AdminsTable } from '@/components/admin/AdminsTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admins — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

export default async function AdminsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (ctx.role !== 'super_admin') redirect('/admin');

  const admins = await listAdmins();

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/admins" />
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
              Admins
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage who can sign in to /admin. Super-admins can invite, deactivate,
              and change roles. Plain admins have full leader CRUD but can&apos;t
              touch settings or other admins.
            </p>
          </div>

          <AdminInviteForm />

          <AdminsTable admins={admins} currentAdminUserId={ctx.adminUserId} />
        </div>
      </main>
    </div>
  );
}

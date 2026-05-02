import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { getSettings } from '@/lib/repos/site-settings';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { SettingsForm } from '@/components/admin/SettingsForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Settings — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (ctx.role !== 'super_admin') redirect('/admin');

  const settings = await getSettings();

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/settings" />
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-semibold mb-6 text-zinc-950 dark:text-zinc-50">
            Settings
          </h1>
          <SettingsForm initial={settings} />
        </div>
      </main>
    </div>
  );
}

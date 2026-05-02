import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { listPrivate } from '@/lib/repos/leaders';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

// Admin pages are never cached. Each visit re-runs SSR (and therefore
// re-emits the view_pii_list audit log entry).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin — San Antonio Bible Talks',
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect('/admin/login');
  }

  const leaders = await listPrivate(ctx);

  return (
    <AdminDashboard
      leaders={leaders}
      adminEmail={ctx.email}
      adminRole={ctx.role}
    />
  );
}

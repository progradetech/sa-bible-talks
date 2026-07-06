import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { listForMap } from '@/lib/repos/leaders';
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

  // Role-aware: staff get every talk with full PII; a leader-role viewer
  // gets full PII only for their own talk, everything else redacted
  // server-side.
  const leaders = await listForMap(ctx);

  return (
    <AdminDashboard
      leaders={leaders}
      adminEmail={ctx.email}
      adminRole={ctx.role}
    />
  );
}

import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { PLACEHOLDER_EMAIL } from '@/lib/constants';
import { listPrivate } from '@/lib/repos/leaders';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { LeadersTable } from '@/components/admin/LeadersTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Leaders — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

export default async function LeadersPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (ctx.role === 'leader') redirect('/admin');

  const leaders = await listPrivate(ctx);

  // Pass only what the directory renders — the full PrivateLeader carries
  // address, admin notes, and exact coordinates that must not end up in the
  // serialized client payload.
  const rows = leaders
    .map((l) => ({
      id: l.id,
      name: l.name,
      email: l.email === PLACEHOLDER_EMAIL ? null : l.email,
      phone: l.phone,
      ministry: l.ministry,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/leaders" />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
            Leaders
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
            Contact directory of all bible talk leaders, including paused and
            hidden groups.
          </p>

          <LeadersTable rows={rows} />
        </div>
      </main>
    </div>
  );
}

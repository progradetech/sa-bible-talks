import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';

export const metadata = {
  title: 'Admin — San Antonio Bible Talks',
  robots: { index: false, follow: false },
};

export default async function AdminDashboardPage() {
  // Middleware ensures the visitor has an AAL2 Supabase session, but the
  // admin_users-row check (is_active, role) lives at the route level.
  const ctx = await getAdminContext();
  if (!ctx) {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8 text-zinc-950 dark:text-zinc-50">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Signed in as <span className="font-medium">{ctx.email}</span> ·{' '}
              <span className="text-xs uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded">
                {ctx.role}
              </span>
            </p>
          </div>
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="text-sm px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Sign out
            </button>
          </form>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6">
          <h2 className="text-sm font-semibold mb-2 uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Coming next
          </h2>
          <ul className="text-sm text-zinc-700 dark:text-zinc-300 space-y-1.5 list-disc list-outside pl-5">
            <li>
              <span className="font-medium">Slice 4b</span> — authenticated map with
              exact pins + leader sidebar + click-to-view drawer
            </li>
            <li>
              <span className="font-medium">Slice 4c</span> — leader CRUD: create, edit,
              delete with synchronous geocoding and drag-to-correct pin
            </li>
            <li>
              <span className="font-medium">Slice 4d</span> — settings (visibility
              toggle, default jitter), audit log viewer, admin invite/management
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

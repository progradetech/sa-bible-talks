import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { approveClaim } from '@/lib/repos/claims';
import { AdminHeader } from '@/components/admin/AdminHeader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Approve claim — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

// One-click approval target for the "claim my bibletalk" email. The
// middleware forces sign-in before this page renders, so email-scanner
// prefetches (no session) never trigger the side effect. approveClaim's
// atomic status flip makes the action one-time: the first admin to open the
// link wins, everyone after sees "already handled".
export default async function ApproveClaimPage({ searchParams }: PageProps) {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');
  if (ctx.role === 'leader') redirect('/admin');

  const { token } = await searchParams;
  const result = token
    ? await approveClaim(token, ctx)
    : ({ outcome: 'not_found' } as const);

  let title: string;
  let detail: string;
  switch (result.outcome) {
    case 'approved':
      title = 'Claim approved';
      detail = `${result.leaderEmail} is now linked to this bible talk, and its contact email has been updated. They can manage it from the map.`;
      break;
    case 'already_handled':
      title = 'Already handled';
      detail = result.approvedAt
        ? `Another admin already approved this claim on ${new Date(result.approvedAt).toLocaleString()}. No further action is needed.`
        : 'This claim was already handled by another admin. No further action is needed.';
      break;
    case 'talk_already_linked':
      title = 'Bible talk no longer available';
      detail =
        'This bible talk was linked to a leader by other means after the claim was filed, so the claim has been closed. The requesting leader can claim a different bible talk.';
      break;
    default:
      title = 'Invalid link';
      detail =
        'This approval link is not valid. It may be malformed or the claim may have been removed.';
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin" />
      <main className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 flex items-start justify-center">
        <div className="w-full max-w-md mt-10 bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-semibold mb-2 text-zinc-950 dark:text-zinc-50">
            {title}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{detail}</p>
          <a
            href="/admin"
            className="inline-block mt-5 px-4 py-2 md:py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            Back to the map
          </a>
        </div>
      </main>
    </div>
  );
}

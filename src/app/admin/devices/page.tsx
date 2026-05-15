import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminContext } from '@/lib/auth';
import { listForAdmin } from '@/lib/repos/trusted-devices';
import { TRUSTED_DEVICE_COOKIE, hashToken } from '@/lib/trusted-device';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { TrustedDevicesTable } from '@/components/admin/TrustedDevicesTable';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Trusted devices — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

export default async function DevicesPage() {
  const ctx = await getAdminContext();
  if (!ctx) redirect('/admin/login');

  const rows = await listForAdmin(ctx.adminUserId);

  // Mark which row matches the current browser by hashing the cookie value
  // server-side and matching against tokenHash. Strip tokenHash before
  // handing rows to the client component so it never leaves the server.
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(TRUSTED_DEVICE_COOKIE)?.value;
  const currentTokenHash = currentToken ? hashToken(currentToken) : null;

  const devices = rows.map((r) => ({
    id: r.id,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    expiresAt: r.expiresAt,
    isCurrent: r.tokenHash === currentTokenHash,
  }));

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <AdminHeader email={ctx.email} role={ctx.role} currentPath="/admin/devices" />
      <main className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
              Trusted devices
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Browsers where you opted to skip the two-factor prompt for 90 days.
              Revoke anything you don&apos;t recognize.
            </p>
          </div>
          <TrustedDevicesTable devices={devices} />
        </div>
      </main>
    </div>
  );
}

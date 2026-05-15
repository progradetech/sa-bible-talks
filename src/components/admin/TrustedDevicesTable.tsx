'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface TrustedDeviceView {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface Props {
  devices: TrustedDeviceView[];
}

export function TrustedDevicesTable({ devices }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function revoke(id: string) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/auth/revoke-trust/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Revoke failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setPendingId(null);
    }
  }

  if (devices.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 text-sm text-zinc-500 dark:text-zinc-400">
        No trusted devices. You&apos;ll be prompted for a 2FA code on every fresh
        sign-in. To trust this device, tick the box on the 2FA screen next time
        you sign in.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Browser</th>
              <th className="text-left px-3 py-2 font-medium">Trusted on</th>
              <th className="text-left px-3 py-2 font-medium">Last seen</th>
              <th className="text-left px-3 py-2 font-medium">Expires</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => {
              const isPending = pendingId === d.id;
              return (
                <tr
                  key={d.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200 max-w-md">
                    <div className="truncate" title={d.userAgent ?? ''}>
                      {d.userAgent || <span className="text-zinc-400">unknown</span>}
                    </div>
                    {d.isCurrent && (
                      <span className="mt-1 inline-block text-[10px] uppercase tracking-wide bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                        this browser
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(d.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(d.lastSeenAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                    {new Date(d.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => revoke(d.id)}
                      className="text-xs px-2 py-1 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                    >
                      {isPending ? 'Revoking…' : 'Revoke'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

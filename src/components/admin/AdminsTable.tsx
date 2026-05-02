'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRow } from '@/lib/repos/admins';
import type { AdminRole } from '@/lib/types';

interface Props {
  admins: AdminRow[];
  currentAdminUserId: string;
}

export function AdminsTable({ admins, currentAdminUserId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function update(id: string, body: { isActive?: boolean; role?: AdminRole }) {
    setPendingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Update failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setPendingId(null);
    }
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
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Last login</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = a.id === currentAdminUserId;
              const isPending = pendingId === a.id;
              return (
                <tr
                  key={a.id}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                    {a.email}
                    {isSelf && (
                      <span className="ml-2 text-[10px] uppercase tracking-wide text-zinc-400">
                        you
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                        a.role === 'super_admin'
                          ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {a.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {a.isActive ? (
                      <span className="text-xs text-green-600 dark:text-green-400">
                        active
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500">inactive</span>
                    )}
                    {a.lockedUntil && new Date(a.lockedUntil) > new Date() && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        locked
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                    {a.lastLoginAt
                      ? new Date(a.lastLoginAt).toLocaleString()
                      : 'never'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      {!isSelf && (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              update(a.id, {
                                role: a.role === 'super_admin' ? 'admin' : 'super_admin',
                              })
                            }
                            className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                          >
                            {a.role === 'super_admin'
                              ? 'Demote → admin'
                              : 'Promote → super_admin'}
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => update(a.id, { isActive: !a.isActive })}
                            className={`text-xs px-2 py-1 border rounded disabled:opacity-50 ${
                              a.isActive
                                ? 'border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                                : 'border-green-300 dark:border-green-900 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30'
                            }`}
                          >
                            {a.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </div>
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

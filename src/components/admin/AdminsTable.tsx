'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRow } from '@/lib/repos/admins';
import type { AdminRole } from '@/lib/types';
import { SetPasswordDialog } from './SetPasswordDialog';

interface Props {
  admins: AdminRow[];
  currentAdminUserId: string;
}

// Fixed locale + timezone so SSR (Node, usually UTC) and the browser produce
// identical output. SA admins live in Central Time, so showing that is also
// the most useful default.
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/Chicago',
});

function providerLabel(a: AdminRow): string {
  // Until the admin has completed a successful login, identity rows in
  // Supabase only reflect how the account was *created* (an 'email' identity
  // is added at invite time), not anything the user has actually chosen —
  // so treat them as invited until we've recorded a real admin login.
  if (!a.lastLoginAt) return 'Invited';
  if (a.hasGoogle && a.hasPassword) return 'Google + Password';
  if (a.hasGoogle) return 'Google';
  if (a.hasPassword) return 'Password';
  return '—';
}

function ActionsMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleDocClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleDocClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleDocClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1"
      >
        Actions
        <span aria-hidden className="text-zinc-400">▾</span>
      </button>
      {open && (
        <div
          role="menu"
          onClick={() => setOpen(false)}
          className="absolute right-0 mt-1 w-52 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md shadow-lg z-20 py-1"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-1.5 text-xs disabled:opacity-50 ${
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
          : 'text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
      }`}
    >
      {children}
    </button>
  );
}

export function AdminsTable({ admins, currentAdminUserId }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [setPasswordTarget, setSetPasswordTarget] = useState<AdminRow | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

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

  function handlePasswordSuccess() {
    const target = setPasswordTarget;
    setSetPasswordTarget(null);
    if (target) {
      const verb = target.hasPassword ? 'Reset' : 'Added';
      setFlash(`${verb} password for ${target.email}.`);
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}
      {flash && (
        <div className="text-sm text-green-700 dark:text-green-400 border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded flex items-center justify-between">
          <span>{flash}</span>
          <button
            type="button"
            onClick={() => setFlash(null)}
            className="text-xs text-green-700/70 dark:text-green-400/70 hover:text-green-700 dark:hover:text-green-400"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium rounded-tl-xl">Email</th>
              <th className="text-left px-3 py-2 font-medium">Role</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-left px-3 py-2 font-medium">Sign-in</th>
              <th className="text-left px-3 py-2 font-medium">Last login</th>
              <th className="text-right px-3 py-2 font-medium rounded-tr-xl">Actions</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const isSelf = a.id === currentAdminUserId;
              const isPending = pendingId === a.id;
              const canSetPassword = !isSelf && (a.hasPassword || a.hasGoogle);
              const setPwLabel = a.hasPassword ? 'Set password' : 'Add password';
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
                  <td className="px-3 py-2">
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded whitespace-nowrap ${
                        !a.lastLoginAt
                          ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      {providerLabel(a)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                    {a.lastLoginAt
                      ? dateTimeFormatter.format(new Date(a.lastLoginAt))
                      : 'never'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!isSelf && (
                      <ActionsMenu>
                        {canSetPassword && (
                          <MenuItem
                            disabled={isPending}
                            onClick={() => setSetPasswordTarget(a)}
                          >
                            {setPwLabel}
                          </MenuItem>
                        )}
                        <MenuItem
                          disabled={isPending}
                          onClick={() =>
                            update(a.id, {
                              role: a.role === 'super_admin' ? 'admin' : 'super_admin',
                            })
                          }
                        >
                          {a.role === 'super_admin'
                            ? 'Demote → admin'
                            : 'Promote → super_admin'}
                        </MenuItem>
                        <MenuItem
                          disabled={isPending}
                          danger
                          onClick={() => update(a.id, { isActive: !a.isActive })}
                        >
                          {a.isActive ? 'Deactivate' : 'Reactivate'}
                        </MenuItem>
                      </ActionsMenu>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {setPasswordTarget && (
        <SetPasswordDialog
          key={setPasswordTarget.id}
          admin={setPasswordTarget}
          open={true}
          onClose={() => setSetPasswordTarget(null)}
          onSuccess={handlePasswordSuccess}
        />
      )}
    </div>
  );
}

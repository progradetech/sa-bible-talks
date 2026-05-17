'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { AdminRow } from '@/lib/repos/admins';

const MIN_PASSWORD_LENGTH = 12;

interface Props {
  admin: AdminRow;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_password: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
  cannot_modify_self: "You can't change your own password from here.",
  not_found: 'Admin not found.',
  forbidden: 'Only super admins can set passwords.',
  unauthorized: 'Your session has expired. Please sign in again.',
  server_error: 'Something went wrong on the server.',
};

export function SetPasswordDialog({ admin, open, onClose, onSuccess }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pwId = useId();
  const confirmId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  const isAdd = !admin.hasPassword;
  const title = isAdd
    ? `Add password for ${admin.email}`
    : `Set password for ${admin.email}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(ERROR_MESSAGES.invalid_password);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admins/${admin.id}/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(ERROR_MESSAGES[data.error ?? ''] ?? 'Update failed.');
        return;
      }
      onSuccess();
    } catch {
      setError('Network error.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel() {
    if (submitting) return;
    onClose();
  }

  // Close on backdrop click (clicks that land on the <dialog> itself, not its
  // children, originate from the backdrop area).
  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === ref.current && !submitting) onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleDialogClick}
      className="rounded-xl p-0 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xl backdrop:bg-black/40 w-full max-w-md"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {isAdd && admin.hasGoogle && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-1.5">
              This account currently signs in with Google only. Setting a password
              will also enable email + password sign-in.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor={pwId}
            className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"
          >
            New password
          </label>
          <input
            id={pwId}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            className="w-full text-sm px-2 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 disabled:opacity-50"
          />
          <p className="text-[11px] text-zinc-500">
            Minimum {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <div className="space-y-1">
          <label
            htmlFor={confirmId}
            className="block text-xs font-medium text-zinc-600 dark:text-zinc-300"
          >
            Confirm password
          </label>
          <input
            id={confirmId}
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={submitting}
            className="w-full text-sm px-2 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 disabled:opacity-50"
          />
        </div>

        {error && (
          <div className="text-xs text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-2 py-1.5 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="text-xs px-3 py-1.5 border border-zinc-900 dark:border-zinc-100 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : isAdd ? 'Add password' : 'Set password'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

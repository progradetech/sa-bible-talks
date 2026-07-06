'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRole } from '@/lib/types';

export function AdminInviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 409) {
          setError(`${email} is already an admin.`);
        } else {
          setError(data.error || 'Invite failed');
        }
        setSubmitting(false);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { linkedTalk?: boolean };
      if (role === 'leader') {
        setSuccess(
          data.linkedTalk
            ? `Invite sent to ${email} — linked to the bible talk with that contact email.`
            : `Invite sent to ${email} — no bible talk matches that email yet; they can claim one from the map.`,
        );
      } else {
        setSuccess(`Invite sent to ${email}.`);
      }
      setEmail('');
      setRole('admin');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5"
    >
      <h2 className="text-base font-semibold mb-1">Invite a new admin</h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
        Sends a Supabase magic-link invite. Until they enroll TOTP, the
        admin_users row exists but they can&apos;t sign in.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
            <option value="leader">leader</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="px-4 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Inviting…' : 'Send invite'}
        </button>
      </div>

      {error && (
        <div className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      {success && (
        <div className="mt-3 text-sm text-green-600 dark:text-green-400">
          {success}
        </div>
      )}
    </form>
  );
}

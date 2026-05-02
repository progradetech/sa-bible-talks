'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SetupPasswordForm() {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        // No active session means the invite token wasn't applied (link
        // expired, or arrived directly without going through /auth/callback).
        router.push('/admin/login');
        return;
      }
      setEmail(user.email ?? null);
      setChecking(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const { error: updateErr } = await supabase.auth.updateUser({ password });
    if (updateErr) {
      setError(updateErr.message);
      setSubmitting(false);
      return;
    }

    // Land at /admin/login next — its init detects the live session at AAL1
    // with no factor enrolled and walks the user through TOTP setup.
    router.push('/admin/login');
    router.refresh();
  }

  if (checking) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400 text-center">Checking your invite…</div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {email && (
        <div className="text-sm text-zinc-600 dark:text-zinc-400">
          Setting password for <span className="font-medium">{email}</span>
        </div>
      )}
      <div>
        <label className="block text-xs font-medium mb-1">
          New password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          autoComplete="new-password"
          minLength={12}
          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          12+ characters
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">
          Confirm password <span className="text-red-500">*</span>
        </label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          autoComplete="new-password"
          minLength={12}
          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Saving…' : 'Set password and continue'}
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
        Next: enroll two-factor authentication.
      </p>
    </form>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GoogleButton } from './GoogleButton';

type Mode = 'choose' | 'password';

export function SetupPasswordForm() {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('choose');

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

  async function handlePasswordSubmit(e: React.FormEvent) {
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

    router.push('/admin/login');
    router.refresh();
  }

  async function handleConnectGoogle() {
    setSubmitting(true);
    setError(null);

    // linkIdentity attaches Google to the currently-signed-in user (the
    // invite already set up a session). After the OAuth round-trip,
    // /auth/callback exchanges the code and forwards to /admin/login,
    // where TOTP enrollment kicks in.
    const { error: linkErr } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin/login`,
      },
    });

    if (linkErr) {
      setError(linkErr.message);
      setSubmitting(false);
    }
    // On success the browser is redirected to Google — no further action.
  }

  if (checking) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
        Checking your invite…
      </div>
    );
  }

  if (mode === 'choose') {
    return (
      <div className="space-y-4">
        {email && (
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Welcome, <span className="font-medium">{email}</span>. Pick a sign-in method:
          </div>
        )}

        <button
          type="button"
          onClick={() => setMode('password')}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700"
        >
          Set a password
        </button>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
          <span>or</span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <GoogleButton onClick={handleConnectGoogle} disabled={submitting}>
          Continue with Google
        </GoogleButton>

        {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          You&apos;ll enroll two-factor authentication next, regardless of which
          method you pick.
        </p>
      </div>
    );
  }

  // mode === 'password'
  return (
    <form onSubmit={handlePasswordSubmit} className="space-y-4">
      <button
        type="button"
        onClick={() => {
          setMode('choose');
          setError(null);
        }}
        className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        ← Back to options
      </button>

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
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">12+ characters</div>
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

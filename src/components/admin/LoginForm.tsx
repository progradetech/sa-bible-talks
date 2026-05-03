'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Step = 'init' | 'credentials' | 'enroll' | 'verify' | 'redirecting';

export function LoginForm() {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [step, setStep] = useState<Step>('init');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{
    qrCode: string;
    secret: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, check if there's already a session at any stage and skip steps.
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setStep('credentials');
        return;
      }

      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;

      if (aalData?.currentLevel === 'aal2') {
        setStep('redirecting');
        router.push('/admin');
        return;
      }

      // AAL1 — figure out next step
      const { data: factorsData } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified');
      if (verifiedTotp) {
        setFactorId(verifiedTotp.id);
        setStep('verify');
      } else {
        // Either no factor or factor still in 'unverified' status from a prior
        // abandoned enrollment. We unenroll the abandoned one and start fresh.
        const abandoned = factorsData?.totp?.find((f) => f.status !== 'verified');
        if (abandoned) {
          await supabase.auth.mfa.unenroll({ factorId: abandoned.id });
        }
        setStep('enroll');
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [supabase, router]);

  async function handleCredentialsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setSubmitting(false);
      return;
    }

    // Re-run init logic to determine next step
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    const verifiedTotp = factorsData?.totp?.find((f) => f.status === 'verified');
    if (verifiedTotp) {
      setFactorId(verifiedTotp.id);
      setStep('verify');
    } else {
      const abandoned = factorsData?.totp?.find((f) => f.status !== 'verified');
      if (abandoned) await supabase.auth.mfa.unenroll({ factorId: abandoned.id });
      setStep('enroll');
    }
    setSubmitting(false);
  }

  async function startEnrollment() {
    setSubmitting(true);
    setError(null);
    const { data, error: enrollErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
    });
    if (enrollErr || !data) {
      setError(enrollErr?.message ?? 'Failed to start enrollment');
      setSubmitting(false);
      return;
    }
    setFactorId(data.id);
    setEnrollment({ qrCode: data.totp.qr_code, secret: data.totp.secret });
    setSubmitting(false);
  }

  // Trigger enrollment data fetch when entering the enroll step
  useEffect(() => {
    if (step === 'enroll' && !enrollment) {
      startEnrollment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setSubmitting(true);
    setError(null);

    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
      factorId,
    });
    if (challengeErr || !challenge) {
      setError(challengeErr?.message ?? 'Failed to challenge');
      setSubmitting(false);
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });

    if (verifyErr) {
      setError(verifyErr.message);
      setCode('');
      setSubmitting(false);
      return;
    }

    // Record login server-side so admin_users.last_login_at updates and a
    // login_success audit entry is written. Best-effort — a network blip
    // shouldn't block the admin from getting into the app.
    try {
      await fetch('/api/auth/record-login', { method: 'POST' });
    } catch {
      /* swallow — proceed to /admin regardless */
    }

    setStep('redirecting');
    router.push('/admin');
    router.refresh();
  }

  if (step === 'init' || step === 'redirecting') {
    return (
      <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading…
      </div>
    );
  }

  if (step === 'credentials') {
    return (
      <form onSubmit={handleCredentialsSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    );
  }

  if (step === 'enroll') {
    return (
      <form onSubmit={handleCodeSubmit} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold mb-2">Set up two-factor authentication</h3>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-3">
            Scan this QR code with an authenticator app (1Password, Google Authenticator,
            Authy, etc.), then enter the 6-digit code below.
          </p>
        </div>

        {enrollment ? (
          <>
            <div className="flex justify-center bg-white p-4 rounded-md border border-zinc-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qrCode} alt="TOTP QR code" className="w-44 h-44" />
            </div>
            <details className="text-xs text-zinc-500 dark:text-zinc-400">
              <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-200">
                Can&apos;t scan? Enter manually
              </summary>
              <div className="mt-2 font-mono break-all bg-zinc-50 dark:bg-zinc-800 p-2 rounded">
                {enrollment.secret}
              </div>
            </details>

            <div>
              <label className="block text-xs font-medium mb-1">6-digit code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                autoComplete="one-time-code"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Verifying…' : 'Verify and finish'}
            </button>
          </>
        ) : (
          <div className="text-center text-sm text-zinc-500 dark:text-zinc-400">
            Generating QR code…
          </div>
        )}
      </form>
    );
  }

  // step === 'verify'
  return (
    <form onSubmit={handleCodeSubmit} className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Two-factor code</h3>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>
      <div>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
          autoFocus
          autoComplete="one-time-code"
          className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <div className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Verifying…' : 'Verify'}
      </button>
    </form>
  );
}

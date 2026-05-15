'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { GoogleButton } from './GoogleButton';

type Step = 'init' | 'credentials' | 'enroll' | 'verify' | 'redirecting';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [trustDevice, setTrustDevice] = useState(false);

  // Tick `now` every 30s while locked so the countdown text updates and the
  // banner / button auto-clears the moment the lockout expires.
  useEffect(() => {
    if (!lockedUntil) return;
    const tick = () => {
      const current = new Date();
      setNow(current);
      if (current >= lockedUntil) setLockedUntil(null);
    };
    tick();
    const interval = setInterval(tick, 30 * 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = lockedUntil !== null && lockedUntil > now;
  const lockoutMinutesLeft = isLocked
    ? Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000))
    : 0;

  // Surface auth_error from /auth/callback redirects (e.g. when Google sign-in
  // succeeded at Google but exchangeCodeForSession failed locally).
  useEffect(() => {
    const authError = searchParams?.get('auth_error');
    if (authError) {
      setError(decodeURIComponent(authError));
    }
  }, [searchParams]);

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

      // If the signed-in user's admin row is locked out, the proxy already
      // bounced them here. Surface the lockout banner instead of letting them
      // see a confusing "Sign in" form when they can't actually sign in.
      try {
        const lockRes = await fetch('/api/auth/check-lockout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        const lockData = (await lockRes.json()) as {
          locked: boolean;
          lockedUntil?: string;
        };
        if (lockData.locked && lockData.lockedUntil) {
          setLockedUntil(new Date(lockData.lockedUntil));
        }
      } catch {
        /* swallow — non-blocking */
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
        // Trusted-device shortcut: if this browser still has a valid trust
        // cookie for the signed-in admin, skip the TOTP prompt entirely.
        // The proxy middleware will let them into /admin without AAL2.
        try {
          const trustRes = await fetch('/api/auth/check-trusted-device', {
            method: 'POST',
          });
          const trustData = (await trustRes.json()) as { trusted: boolean };
          if (cancelled) return;
          if (trustData.trusted) {
            setStep('redirecting');
            router.push('/admin');
            return;
          }
        } catch {
          /* fall through to TOTP prompt */
        }
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

    const emailLower = email.trim().toLowerCase();

    // Check existing lockout state before bothering Supabase. The endpoint
    // is public but returns the same shape for unknown emails, so it doesn't
    // leak which addresses are admins.
    try {
      const lockRes = await fetch('/api/auth/check-lockout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailLower }),
      });
      const lockData = (await lockRes.json()) as {
        locked: boolean;
        lockedUntil?: string;
      };
      if (lockData.locked && lockData.lockedUntil) {
        setLockedUntil(new Date(lockData.lockedUntil));
        setSubmitting(false);
        return;
      }
    } catch {
      // Lockout check failed (network blip) — proceed; Supabase still
      // rate-limits at the auth layer regardless.
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: emailLower,
      password,
    });

    if (signInError) {
      // Tell the server to bump the failure counter. Response tells us if
      // this attempt tripped the lockout (or how many attempts remain).
      let attemptsLeft: number | undefined;
      try {
        const failRes = await fetch('/api/auth/record-failure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailLower }),
        });
        const failData = (await failRes.json()) as {
          locked: boolean;
          attemptsLeft?: number;
          lockedUntil?: string;
        };
        if (failData.locked && failData.lockedUntil) {
          setLockedUntil(new Date(failData.lockedUntil));
          setSubmitting(false);
          return;
        }
        attemptsLeft = failData.attemptsLeft;
      } catch {
        /* swallow — fall through to generic error */
      }

      setError(
        attemptsLeft !== undefined && attemptsLeft <= 3
          ? `${signInError.message}. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left before lockout.`
          : signInError.message,
      );
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

    // Grant device trust if the user opted in. Best-effort — failure here
    // just means they'll be prompted for TOTP again on the next session.
    if (trustDevice) {
      try {
        await fetch('/api/auth/grant-trust', { method: 'POST' });
      } catch {
        /* swallow */
      }
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

  async function handleGoogleSignIn() {
    setSubmitting(true);
    setError(null);
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/admin/login`,
      },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setSubmitting(false);
    }
    // On success the browser is redirected to Google.
  }

  if (step === 'credentials') {
    return (
      <form onSubmit={handleCredentialsSubmit} className="space-y-4">
        {isLocked && (
          <div
            role="alert"
            className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-900 rounded-md"
          >
            <div className="text-sm font-medium text-red-700 dark:text-red-300">
              Account locked
            </div>
            <div className="text-xs text-red-600 dark:text-red-400 mt-1">
              Too many failed login attempts. Try again in {lockoutMinutesLeft} minute
              {lockoutMinutesLeft === 1 ? '' : 's'}.
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={isLocked}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
            disabled={isLocked}
            className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
        </div>
        {error && !isLocked && (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        )}
        <button
          type="submit"
          disabled={submitting || isLocked}
          className="w-full py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLocked ? 'Locked' : submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
          <span>or</span>
          <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-800" />
        </div>

        <GoogleButton onClick={handleGoogleSignIn} disabled={submitting || isLocked}>
          Continue with Google
        </GoogleButton>
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
      <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400 cursor-pointer">
        <input
          type="checkbox"
          checked={trustDevice}
          onChange={(e) => setTrustDevice(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Trust this device for 90 days. Skip the 6-digit code on this browser
          until then. Don&apos;t check this on a shared computer.
        </span>
      </label>
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

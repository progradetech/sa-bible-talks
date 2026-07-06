'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// `@supabase/ssr`'s createBrowserClient has `detectSessionInUrl` hardcoded on
// in browsers, so the SDK auto-exchanges the PKCE `?code=...` (and the
// implicit `#access_token=...` hash) during _initialize. Our job here is just
// to wait for the resulting session to settle and then forward to `next`.
//
// Note: do NOT call exchangeCodeForSession manually — the verifier is
// consumed by the auto-exchange and a second call will fail with
// "PKCE code verifier not found in storage".
export function AuthCallbackClient() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const next = params?.get('next') || '/admin/setup-password';
    const hashParams = new URLSearchParams(
      typeof window !== 'undefined' ? window.location.hash.slice(1) : '',
    );

    // Surface auth errors. OAuth providers put them in the query string;
    // Supabase's email-link verify endpoint puts them in the hash fragment
    // (e.g. #error_code=otp_expired for a stale invite link).
    const authError =
      params?.get('error_description') ||
      params?.get('error') ||
      hashParams.get('error_description') ||
      hashParams.get('error');
    if (authError) {
      router.replace(`/admin/login?auth_error=${encodeURIComponent(authError)}`);
      return;
    }

    const code = params?.get('code');
    const accessToken = hashParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token');
    if (!code && !accessToken) {
      router.replace('/admin/login?auth_error=missing_token');
      return;
    }

    const supabase = createClient();
    let resolved = false;

    function succeed() {
      if (resolved) return;
      resolved = true;
      router.replace(next);
    }

    function fail(reason: string) {
      if (resolved) return;
      resolved = true;
      router.replace(`/admin/login?auth_error=${encodeURIComponent(reason)}`);
    }

    // Email links (invites, recovery) arrive as implicit-style hash tokens:
    // Supabase's verify endpoint redirects with #access_token=...&
    // refresh_token=.... Our browser client runs the PKCE flow, and
    // supabase-js ignores implicit-grant hash tokens under PKCE — so consume
    // them explicitly. Without this, invite acceptance times out.
    if (accessToken && refreshToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (error || !data.session) fail(error?.message ?? 'invalid_invite_link');
          else succeed();
        })
        .catch(() => fail('invalid_invite_link'));
      return () => {};
    }

    // PKCE `?code=` (OAuth): the auto-exchange happens inside _initialize and
    // emits SIGNED_IN via setTimeout(..., 0), so we may subscribe slightly
    // before or after the event fires. Cover both:
    //   1. Subscribe — catches the event if it fires after we mount.
    //   2. Poll getSession() — catches it if it fired before our subscription.
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) succeed();
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) succeed();
    });

    // Safety net. If after 5s neither the event fired nor a session exists,
    // something is genuinely broken — show a generic error rather than a
    // permanent "Processing…" spinner.
    const timeout = setTimeout(() => fail('callback_timeout'), 5000);

    return () => {
      subscription.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        Processing your sign-in…
      </div>
    </div>
  );
}

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

    // Surface OAuth provider errors (`?error=...`) — these arrive when Google
    // itself rejects the user (denied consent, account disabled, etc.) and
    // are not something the SDK exchange can fix.
    const oauthError = params?.get('error_description') || params?.get('error');
    if (oauthError) {
      router.replace(`/admin/login?auth_error=${encodeURIComponent(oauthError)}`);
      return;
    }

    const code = params?.get('code');
    const hashHasToken =
      typeof window !== 'undefined' &&
      window.location.hash.includes('access_token=');
    if (!code && !hashHasToken) {
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

    // The auto-exchange happens inside _initialize and emits SIGNED_IN via
    // setTimeout(..., 0), so we may subscribe slightly before or after the
    // event fires. Cover both:
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

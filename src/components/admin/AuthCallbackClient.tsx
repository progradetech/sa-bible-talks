'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Runs entirely client-side because the implicit-flow tokens land in the URL
// fragment (#access_token=...&refresh_token=...) which the server never
// receives. We also handle ?code=XXX (PKCE) on the off chance Supabase ever
// switches to it for invites.
export function AuthCallbackClient() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const next = params?.get('next') || '/admin/setup-password';

      // TEMP DIAGNOSTICS — remove once Google sign-in works.
      console.log('[AuthCallback] run', {
        next,
        hasCode: params?.has('code'),
        hash: window.location.hash,
        urlError: params?.get('error'),
        urlErrorDesc: params?.get('error_description'),
      });

      // Surface OAuth provider errors that arrive as ?error=... before we
      // try to exchange (Google rejected, user denied, etc.).
      const oauthError = params?.get('error_description') || params?.get('error');
      if (oauthError) {
        router.replace(`/admin/login?auth_error=${encodeURIComponent(oauthError)}`);
        return;
      }

      // PKCE flow: ?code=XXX
      const code = params?.get('code');
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        console.log('[AuthCallback] exchange', {
          ok: !error,
          error: error?.message,
          hasSession: !!data?.session,
          hasUser: !!data?.user,
          userEmail: data?.user?.email,
        });
        if (cancelled) return;
        if (error) {
          router.replace(`/admin/login?auth_error=${encodeURIComponent(error.message)}`);
          return;
        }

        // Verify the session is actually set in browser cookies before we
        // hand off to the next page. If this returns null, the cookie
        // didn't stick.
        const verify = await supabase.auth.getUser();
        console.log('[AuthCallback] post-exchange getUser', {
          hasUser: !!verify.data.user,
          userEmail: verify.data.user?.email,
        });
        if (cancelled) return;

        router.replace(next);
        return;
      }

      // Implicit / legacy: #access_token=...&refresh_token=...
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : '';
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const errorDesc = hashParams.get('error_description');

        if (errorDesc) {
          router.replace(`/admin/login?auth_error=${encodeURIComponent(errorDesc)}`);
          return;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          if (error) {
            router.replace(`/admin/login?auth_error=${encodeURIComponent(error.message)}`);
            return;
          }
          router.replace(next);
          return;
        }
      }

      // No code, no token — link probably expired or was tampered with.
      router.replace('/admin/login?auth_error=missing_token');
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [params, router, supabase]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">
        Processing your invite…
      </div>
    </div>
  );
}

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

      // PKCE flow: ?code=XXX
      const code = params?.get('code');
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          router.replace(`/admin/login?auth_error=${encodeURIComponent(error.message)}`);
          return;
        }
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

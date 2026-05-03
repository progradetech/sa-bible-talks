import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthCallbackClient } from '@/components/admin/AuthCallbackClient';

export const metadata: Metadata = {
  title: 'Sign in — SA Bible Talks',
  robots: { index: false, follow: false },
};

// Suspense boundary required because AuthCallbackClient uses useSearchParams.
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</div>
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}

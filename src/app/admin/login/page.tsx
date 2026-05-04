import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/admin/LoginForm';

export const metadata: Metadata = {
  title: 'Admin Login — San Antonio Bible Talks',
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg w-full max-w-sm p-6 text-zinc-950 dark:text-zinc-50">
        <h1 className="text-xl font-semibold mb-1">Admin sign in</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
          San Antonio Bible Talks
        </p>
        {/* Suspense required because LoginForm uses useSearchParams() to
            read auth_error from the URL after a failed OAuth callback.
            Without it, Next.js fails build-time prerender of this page. */}
        <Suspense
          fallback={
            <div className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
              Loading…
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}

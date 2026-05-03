import type { Metadata } from 'next';
import { SetupPasswordForm } from '@/components/admin/SetupPasswordForm';

export const metadata: Metadata = {
  title: 'Finish setup — SA Bible Talks Admin',
  robots: { index: false, follow: false },
};

export default function SetupPasswordPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-lg w-full max-w-sm p-6 text-zinc-950 dark:text-zinc-50">
        <h1 className="text-xl font-semibold mb-1">Finish setting up your account</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-5">
          You&apos;ve accepted the invite — pick a sign-in method and you&apos;re in.
        </p>
        <SetupPasswordForm />
      </div>
    </div>
  );
}

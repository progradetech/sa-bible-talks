'use client';

import { useState } from 'react';
import type { AdminRole, PrivateLeader } from '@/lib/types';
import { AdminMap } from './AdminMap';
import { LeaderSidebar } from './LeaderSidebar';
import { LeaderDrawer } from './LeaderDrawer';

interface Props {
  leaders: PrivateLeader[];
  adminEmail: string;
  adminRole: AdminRole;
}

export function AdminDashboard({ leaders, adminEmail, adminRole }: Props) {
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const selectedLeader =
    leaders.find((l) => l.id === selectedLeaderId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950">
      <header className="z-30 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-base font-semibold whitespace-nowrap text-zinc-950 dark:text-zinc-50">
            SA Bible Talks
          </h1>
          <span className="text-xs uppercase tracking-wide text-zinc-400">
            Admin
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-600 dark:text-zinc-300 truncate max-w-[20ch]">
            {adminEmail}
          </span>
          <span className="text-[10px] uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
            {adminRole}
          </span>
          <form action="/api/auth/sign-out" method="post">
            <button
              type="submit"
              className="text-xs px-2.5 py-1 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        <AdminMap
          leaders={leaders}
          selectedLeaderId={selectedLeaderId}
          onSelect={setSelectedLeaderId}
        />
        <LeaderSidebar
          leaders={leaders}
          selectedLeaderId={selectedLeaderId}
          onSelect={setSelectedLeaderId}
        />
        <LeaderDrawer
          leader={selectedLeader}
          onClose={() => setSelectedLeaderId(null)}
        />
      </main>
    </div>
  );
}

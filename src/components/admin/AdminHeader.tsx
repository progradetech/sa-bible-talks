import Link from 'next/link';
import type { AdminRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  superAdminOnly?: boolean;
}

const NAV: NavItem[] = [
  { href: '/admin', label: 'Map' },
  { href: '/admin/audit', label: 'Audit' },
  { href: '/admin/settings', label: 'Settings', superAdminOnly: true },
  { href: '/admin/admins', label: 'Admins', superAdminOnly: true },
];

interface Props {
  email: string;
  role: AdminRole;
  currentPath?: string;
}

export function AdminHeader({ email, role, currentPath }: Props) {
  const visible = NAV.filter((n) => !n.superAdminOnly || role === 'super_admin');

  return (
    <header className="z-30 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-base font-semibold whitespace-nowrap text-zinc-950 dark:text-zinc-50">
          SA Bible Talks
        </h1>
        <span className="text-xs uppercase tracking-wide text-zinc-400">Admin</span>
        <nav className="flex items-center gap-1 ml-3">
          {visible.map((n) => {
            const active = currentPath === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`text-xs px-2 py-1 rounded ${
                  active
                    ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 font-medium'
                    : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <span className="text-zinc-600 dark:text-zinc-300 truncate max-w-[24ch]">
          {email}
        </span>
        <span className="text-[10px] uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
          {role}
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
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  // Roles that see this link; omit for all roles (including leader).
  roles?: AdminRole[];
}

const STAFF: AdminRole[] = ['super_admin', 'admin'];

const NAV: NavItem[] = [
  { href: '/admin', label: 'Map' },
  { href: '/admin/leaders', label: 'Leaders', roles: STAFF },
  { href: '/admin/comms', label: 'Comms', roles: STAFF },
  { href: '/admin/audit', label: 'Audit', roles: STAFF },
  { href: '/admin/devices', label: 'Devices' },
  { href: '/admin/settings', label: 'Settings', roles: ['super_admin'] },
  { href: '/admin/admins', label: 'Admins', roles: ['super_admin'] },
];

interface Props {
  email: string;
  role: AdminRole;
  currentPath?: string;
}

export function AdminHeader({ email, role, currentPath }: Props) {
  const visible = NAV.filter((n) => !n.roles || n.roles.includes(role));
  const [navOpen, setNavOpen] = useState(false);

  return (
    <header className="relative z-30 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          type="button"
          aria-label="Toggle menu"
          aria-expanded={navOpen}
          onClick={() => setNavOpen((v) => !v)}
          className="md:hidden -ml-1 p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
        >
          {navOpen ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          )}
        </button>

        <h1 className="text-base font-semibold whitespace-nowrap text-zinc-950 dark:text-zinc-50">
          SA Bible Talks
        </h1>
        <span className="hidden md:inline text-xs uppercase tracking-wide text-zinc-400">
          Admin
        </span>
        <nav className="hidden md:flex items-center gap-1 ml-3">
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

      {/* Desktop user info — unchanged */}
      <div className="hidden md:flex items-center gap-3 text-sm">
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

      {/* Mobile role badge in header bar */}
      <span className="md:hidden text-[10px] uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
        {role === 'super_admin' ? 'super' : role}
      </span>

      {/* Mobile dropdown menu */}
      {navOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shadow-lg z-30">
          <nav className="flex flex-col py-1">
            {visible.map((n) => {
              const active = currentPath === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={() => setNavOpen(false)}
                  className={`px-4 py-3 text-sm border-l-4 ${
                    active
                      ? 'border-blue-500 bg-zinc-50 dark:bg-zinc-800 text-zinc-950 dark:text-zinc-50 font-medium'
                      : 'border-transparent text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-zinc-600 dark:text-zinc-300 truncate min-w-0">
              {email}
            </span>
            <form action="/api/auth/sign-out" method="post">
              <button
                type="submit"
                className="text-xs px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 whitespace-nowrap"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}

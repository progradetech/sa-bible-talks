'use client';

import { useMemo, useState } from 'react';
import type { Ministry, PrivateLeader } from '@/lib/types';

const MINISTRY_COLORS: Record<Ministry, string> = {
  Family: '#2196F3',
  YoPro: '#FF9800',
  Campus: '#9C27B0',
  Singles: '#E91E63',
  Spanish: '#4CAF50',
};

interface Props {
  leaders: PrivateLeader[];
  selectedLeaderId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  open: boolean;
  onClose: () => void;
}

export function LeaderSidebar({
  leaders,
  selectedLeaderId,
  onSelect,
  onCreate,
  open,
  onClose,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leaders;
    return leaders.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.ministry.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q) ?? false),
    );
  }, [leaders, search]);

  return (
    <aside
      className={`absolute inset-3 z-30 w-auto md:left-3 md:top-3 md:bottom-3 md:right-auto md:inset-auto md:w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-lg shadow-lg flex-col text-zinc-950 dark:text-zinc-50 ${
        open ? 'flex' : 'hidden md:flex'
      }`}
    >
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCreate}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 md:py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <span aria-hidden>+</span>
            <span>Add leader</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close leaders"
            className="md:hidden p-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 leading-none text-lg"
          >
            ✕
          </button>
        </div>
        <input
          type="search"
          placeholder="Search name, ministry, address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 md:py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {filtered.length} of {leaders.length} {leaders.length === 1 ? 'leader' : 'leaders'}
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {filtered.map((l) => {
          const selected = l.id === selectedLeaderId;
          return (
            <li key={l.id}>
              <button
                onClick={() => onSelect(selected ? null : l.id)}
                className={`w-full text-left px-3 py-3 md:py-2 flex items-center gap-2 transition-colors ${
                  selected
                    ? 'bg-blue-50 dark:bg-blue-950/40'
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: MINISTRY_COLORS[l.ministry] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{l.name}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {l.ministry}
                    {l.language !== 'English' ? ` · ${l.language}` : ''}
                    {l.kidFriendly ? ' · Kids' : ''}
                  </div>
                </div>
                <div className="flex flex-wrap gap-0.5 items-end justify-end max-w-[5.5rem]">
                  {l.hideFromPublicMap && (
                    <span className="text-[9px] uppercase font-semibold text-amber-600 dark:text-amber-400">
                      Hidden
                    </span>
                  )}
                  {l.isPaused && (
                    <span className="text-[9px] uppercase font-semibold text-zinc-500">
                      Paused
                    </span>
                  )}
                  {!l.isActive && (
                    <span className="text-[9px] uppercase font-semibold text-red-600 dark:text-red-400">
                      Inactive
                    </span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-sm text-zinc-500 text-center italic">
            No matches
          </li>
        )}
      </ul>
    </aside>
  );
}

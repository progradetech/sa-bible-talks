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
}

export function LeaderSidebar({ leaders, selectedLeaderId, onSelect }: Props) {
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
    <aside className="absolute left-3 top-3 bottom-3 z-10 w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur rounded-lg shadow-lg flex flex-col text-zinc-950 dark:text-zinc-50">
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <input
          type="search"
          placeholder="Search name, ministry, address, email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
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
                className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
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
                <div className="flex flex-col gap-0.5 items-end">
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

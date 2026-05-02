'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { AuditEntry } from '@/lib/repos/audit';

interface Props {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[]; // available action names for the filter dropdown
  canFilterByActor: boolean; // super_admin sees all, plain admin scoped to self
}

export function AuditTable({
  entries,
  total,
  page,
  pageSize,
  actions,
  canFilterByActor,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params?.toString());
    if (value && value.length > 0) next.set(key, value);
    else next.delete(key);
    next.delete('page'); // reset to page 1 on filter change
    router.push(`/admin/audit?${next.toString()}`);
  }

  function setPage(n: number) {
    const next = new URLSearchParams(params?.toString());
    if (n <= 1) next.delete('page');
    else next.set('page', n.toString());
    router.push(`/admin/audit?${next.toString()}`);
  }

  const currentAction = params?.get('action') ?? '';
  const currentActor = params?.get('actor') ?? '';

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
            Action
          </label>
          <select
            value={currentAction}
            onChange={(e) => setParam('action', e.target.value || null)}
            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {canFilterByActor && (
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              Actor email
            </label>
            <input
              type="text"
              defaultValue={currentActor}
              placeholder="e.g. andrew@…"
              onBlur={(e) => setParam('actor', e.target.value || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setParam('actor', e.currentTarget.value || null);
                }
              }}
              className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        <div className="text-xs text-zinc-500 dark:text-zinc-400 ml-auto">
          {total} {total === 1 ? 'entry' : 'entries'}
          {currentAction || currentActor ? ' (filtered)' : ''}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">When</th>
              <th className="text-left px-3 py-2 font-medium">Actor</th>
              <th className="text-left px-3 py-2 font-medium">Action</th>
              <th className="text-left px-3 py-2 font-medium">Target</th>
              <th className="text-left px-3 py-2 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="border-t border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200 whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                  {e.actorEmail ?? <em className="text-zinc-400">system</em>}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-200">
                  {e.action}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                  {e.targetId ? e.targetId.slice(0, 8) + '…' : '—'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                  {e.ip ?? '—'}
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-12 text-center text-sm text-zinc-500 italic"
                >
                  No audit entries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="text-zinc-500">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded-md hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

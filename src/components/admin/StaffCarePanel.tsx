'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CARE_STAGES, CARE_TYPES, CARE_TYPE_LABELS, type CareType } from '@/lib/care-stages';
import type { CareTalkOption } from '@/lib/types';
import { EntryCard, NewEntryForm, type CareRow } from './CarePanel';

export interface TalkCount {
  bibleTalkId: string | null;
  talkLabel: string;
  total: number;
}

interface Props {
  rows: CareRow[];
  talkOptions: CareTalkOption[];
  counts: TalkCount[];
  filters: {
    talk: string; // '' = all, 'unassigned' = the unassigned bucket
    type: CareType | '';
    stage: string;
    archived: boolean;
  };
}

const selectClasses =
  'text-xs px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200';

export function StaffCarePanel({ rows, talkOptions, counts, filters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParams(next: Partial<Props['filters']>) {
    const params = new URLSearchParams(searchParams.toString());
    const merged = { ...filters, ...next };

    if (merged.talk) params.set('talk', merged.talk);
    else params.delete('talk');

    if (merged.type) params.set('type', merged.type);
    else params.delete('type');

    if (merged.type && merged.stage) params.set('stage', merged.stage);
    else params.delete('stage');

    if (merged.archived) params.set('archived', '1');
    else params.delete('archived');

    const qs = params.toString();
    router.push(qs ? `/admin/care?${qs}` : '/admin/care');
  }

  function refresh() {
    router.refresh();
  }

  const stageOptions = filters.type ? CARE_STAGES[filters.type] : [];
  const overallTotal = counts.reduce((sum, c) => sum + c.total, 0);

  return (
    <div className="space-y-4">
      {/* Totals */}
      <div className="flex flex-wrap gap-2">
        <span className="text-xs px-2 py-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
          {overallTotal} active total
        </span>
        {counts.map((c) => (
          <button
            key={c.bibleTalkId ?? 'unassigned'}
            type="button"
            onClick={() =>
              setParams({ talk: c.bibleTalkId === null ? 'unassigned' : c.bibleTalkId })
            }
            className="text-xs px-2 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
          >
            {c.talkLabel}: {c.total}
          </button>
        ))}
      </div>

      {/* Filters + create */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.talk}
          onChange={(e) => setParams({ talk: e.target.value })}
          className={selectClasses}
        >
          <option value="">All talks</option>
          <option value="unassigned">Unassigned</option>
          {talkOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(e) => setParams({ type: (e.target.value as CareType) || '', stage: '' })}
          className={selectClasses}
        >
          <option value="">All types</option>
          {CARE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CARE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>

        {filters.type && (
          <select
            value={filters.stage}
            onChange={(e) => setParams({ stage: e.target.value })}
            className={selectClasses}
          >
            <option value="">All stages</option>
            {stageOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={filters.archived}
            onChange={(e) => setParams({ archived: e.target.checked })}
          />
          Show archived
        </label>

        <div className="ml-auto">
          <NewEntryForm onCreated={refresh} talkOptions={talkOptions} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 text-sm text-zinc-500 dark:text-zinc-400">
          No care entries match these filters.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onChanged={refresh} talkOptions={talkOptions} />
          ))}
        </div>
      )}
    </div>
  );
}

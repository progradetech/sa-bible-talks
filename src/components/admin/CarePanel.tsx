'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ARCHIVED_STAGE,
  CARE_STAGE_LABELS,
  CARE_STAGES,
  CARE_TYPES,
  CARE_TYPE_LABELS,
  type CareType,
} from '@/lib/care-stages';
import type { CareTalkOption } from '@/lib/types';

export interface CareRow {
  id: string;
  type: CareType;
  stage: string;
  personName: string | null;
  contact: string | null;
  details: string | null;
  outcome: string | null;
  createdAt: string;
  archivedAt: string | null;
  // Staff (cross-talk) view only.
  bibleTalkId?: string | null;
  talkLabel?: string;
}

interface Props {
  initialRows: CareRow[];
}

export const inputClasses =
  'w-full text-sm px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100';

export function NewEntryForm({
  onCreated,
  talkOptions,
}: {
  onCreated: () => void;
  // Staff mode: lets the creator pick a talk (or leave unassigned). Omitted
  // entirely for the leader board, where entries always go to their own talk.
  talkOptions?: CareTalkOption[];
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<CareType>('prayer_request');
  const [bibleTalkId, setBibleTalkId] = useState('');
  const [personName, setPersonName] = useState('');
  const [contact, setContact] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/care', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          ...(talkOptions ? { bibleTalkId: bibleTalkId || null } : {}),
          personName: personName.trim() || undefined,
          contact: contact.trim() || undefined,
          details: details.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Create failed');
        return;
      }
      setPersonName('');
      setContact('');
      setDetails('');
      setBibleTalkId('');
      setOpen(false);
      onCreated();
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
      >
        + New care entry
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-4 space-y-3"
    >
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
          Type
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CareType)}
          className={inputClasses}
        >
          {CARE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CARE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {talkOptions && (
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
            Talk
          </label>
          <select
            value={bibleTalkId}
            onChange={(e) => setBibleTalkId(e.target.value)}
            className={inputClasses}
          >
            <option value="">Unassigned</option>
            {talkOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
          Person (optional)
        </label>
        <input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          className={inputClasses}
          placeholder="Name"
        />
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
          Contact (optional)
        </label>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          className={inputClasses}
          placeholder="Phone or email"
        />
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
          Details
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          className={inputClasses}
          rows={3}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="text-xs px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function EntryCard({
  entry,
  onChanged,
  talkOptions,
}: {
  entry: CareRow;
  onChanged: () => void;
  // Staff mode: shows the entry's talk and a reassign control.
  talkOptions?: CareTalkOption[];
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const isArchived = !!entry.archivedAt;
  const stages = CARE_STAGES[entry.type];

  async function patch(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/care/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Update failed');
        return;
      }
      onChanged();
    } catch {
      setError('Network error');
    } finally {
      setPending(false);
    }
  }

  async function setStage(stage: string, outcomeNote?: string) {
    await patch({ stage, ...(outcomeNote !== undefined ? { outcome: outcomeNote } : {}) });
  }

  async function assignTalk(talkId: string) {
    await patch({ bibleTalkId: talkId || null });
  }

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/care/${entry.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Delete failed');
        setConfirmingDelete(false);
        return;
      }
      onChanged();
    } catch {
      setError('Network error');
      setConfirmingDelete(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-4 space-y-2">
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] uppercase tracking-wide bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
            {CARE_TYPE_LABELS[entry.type]}
          </span>
          {entry.personName && (
            <div className="font-medium text-zinc-900 dark:text-zinc-100 mt-1 break-words">
              {entry.personName}
            </div>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300 shrink-0">
          {CARE_STAGE_LABELS[entry.stage] ?? entry.stage}
        </span>
      </div>

      {talkOptions && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 dark:text-zinc-400 shrink-0">Talk:</span>
          <select
            value={entry.bibleTalkId ?? ''}
            disabled={pending}
            onChange={(e) => assignTalk(e.target.value)}
            className="text-xs px-1.5 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 min-w-0"
          >
            <option value="">Unassigned</option>
            {talkOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {entry.contact && (
        <div className="text-sm text-zinc-600 dark:text-zinc-300 break-words">
          {entry.contact}
        </div>
      )}
      {entry.details && (
        <div className="text-sm text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">
          {entry.details}
        </div>
      )}
      {isArchived && entry.outcome && (
        <div className="text-sm text-zinc-500 dark:text-zinc-400 italic break-words">
          Outcome: {entry.outcome}
        </div>
      )}

      {!isArchived && !archiving && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {stages.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending || s === entry.stage}
              onClick={() => setStage(s)}
              className={`text-xs px-2 py-1 rounded border ${
                s === entry.stage
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                  : 'border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {CARE_STAGE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      )}

      {!isArchived && archiving && (
        <div className="pt-1 space-y-2">
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="Outcome (optional)"
            rows={2}
            className={inputClasses}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setStage(ARCHIVED_STAGE, outcome.trim() || undefined)}
              className="text-xs px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded disabled:opacity-50"
            >
              Confirm archive
            </button>
            <button
              type="button"
              onClick={() => setArchiving(false)}
              className="text-xs px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <span className="text-[11px] text-zinc-400">
          {new Date(entry.createdAt).toLocaleDateString()}
        </span>
        <div className="flex gap-2">
          {!isArchived && !archiving && (
            <button
              type="button"
              onClick={() => setArchiving(true)}
              className="text-xs px-2 py-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              Archive
            </button>
          )}
          {isArchived && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStage(stages[0])}
              className="text-xs px-2 py-1 text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              Reopen
            </button>
          )}
          {!confirmingDelete ? (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="text-xs px-2 py-1 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
            >
              Delete
            </button>
          ) : (
            <span className="flex items-center gap-1">
              <span className="text-xs text-zinc-500">Delete?</span>
              <button
                type="button"
                disabled={pending}
                onClick={handleDelete}
                className="text-xs px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded disabled:opacity-50"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="text-xs px-2 py-1 border border-zinc-300 dark:border-zinc-700 rounded"
              >
                No
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CarePanel({ initialRows }: Props) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);

  function refresh() {
    router.refresh();
  }

  const visible = initialRows.filter((r) => showArchived || !r.archivedAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <NewEntryForm onCreated={refresh} />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 text-sm text-zinc-500 dark:text-zinc-400">
          No care entries yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((entry) => (
            <EntryCard key={entry.id} entry={entry} onChanged={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

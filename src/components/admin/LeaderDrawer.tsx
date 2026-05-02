'use client';

import type { ReactNode } from 'react';
import type { PrivateLeader } from '@/lib/types';

interface Props {
  leader: PrivateLeader | null;
  onClose: () => void;
  onEdit: () => void;
}

export function LeaderDrawer({ leader, onClose, onEdit }: Props) {
  if (!leader) return null;

  return (
    <aside className="absolute right-3 top-3 bottom-3 z-20 w-96 bg-white dark:bg-zinc-900 rounded-lg shadow-2xl flex flex-col text-zinc-950 dark:text-zinc-50 overflow-hidden">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold truncate">{leader.name}</h3>
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {leader.ministry} ministry
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="px-2.5 py-1 text-xs font-medium border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 -m-1 leading-none"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <Pill on={leader.isActive} label="Active" />
          {leader.hideFromPublicMap && <Pill on warning label="Hidden from public" />}
          {leader.isPaused && <Pill on label="Paused" />}
          {!leader.isActive && <Pill on danger label="Inactive" />}
        </div>

        <Field label="Address" value={leader.address} />
        <Field
          label="Email"
          value={
            <a
              href={`mailto:${leader.email}`}
              className="text-blue-600 dark:text-blue-400 hover:underline break-all"
            >
              {leader.email}
            </a>
          }
        />
        <Field
          label="Phone"
          value={
            leader.phone ? (
              <a
                href={`tel:${leader.phone}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                {leader.phone}
              </a>
            ) : (
              <Empty />
            )
          }
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Language" value={leader.language} />
          <Field label="Kid-friendly" value={leader.kidFriendly ? 'Yes' : 'No'} />
        </div>

        <Field
          label="Public group name"
          value={
            leader.groupName ? (
              <>
                <span>{leader.groupName}</span>
                <span className="text-xs text-zinc-500 ml-2">
                  ({leader.groupName ? 'shown' : 'hidden'})
                </span>
              </>
            ) : (
              <Empty>not set</Empty>
            )
          }
        />

        <Field
          label="Meeting info (public)"
          value={leader.meetingInfo || <Empty>not set</Empty>}
        />

        <Field
          label="Admin notes (private)"
          multiline
          value={leader.adminNotes || <Empty>none</Empty>}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Exact location"
            value={
              <span className="font-mono text-xs">
                {leader.exactLat.toFixed(4)}, {leader.exactLng.toFixed(4)}
              </span>
            }
          />
          <Field
            label="Jitter override"
            value={
              leader.jitterMiles ? (
                <>{leader.jitterMiles} mi</>
              ) : (
                <Empty>default 1.5 mi</Empty>
              )
            }
          />
        </div>

      </div>
    </aside>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: ReactNode;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-0.5">
        {label}
      </div>
      <div
        className={`text-sm ${multiline ? 'whitespace-pre-wrap' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}

function Empty({ children = 'none' }: { children?: ReactNode }) {
  return <em className="text-zinc-400">{children}</em>;
}

function Pill({
  on,
  label,
  warning,
  danger,
}: {
  on: boolean;
  label: string;
  warning?: boolean;
  danger?: boolean;
}) {
  if (!on) return null;
  let cls =
    'inline-block text-[10px] uppercase font-semibold tracking-wide px-1.5 py-0.5 rounded ';
  if (danger) cls += 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300';
  else if (warning)
    cls += 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
  else cls += 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  return <span className={cls}>{label}</span>;
}

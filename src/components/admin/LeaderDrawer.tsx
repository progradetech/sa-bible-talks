'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminRole, MapLeader } from '@/lib/types';

interface Props {
  leader: MapLeader | null;
  onClose: () => void;
  onEdit: () => void;
  role: AdminRole;
}

const CLAIM_ERROR_MESSAGES: Record<string, string> = {
  already_linked: 'You already manage a bible talk.',
  claim_pending: 'You already have a claim waiting for admin approval.',
  talk_linked: 'This bible talk is already managed by another leader.',
  talk_has_email: 'This bible talk already has a contact email.',
  rate_limited: 'Too many claim requests. Please wait a bit.',
};

export function LeaderDrawer({ leader, onClose, onEdit, role }: Props) {
  const router = useRouter();
  const [claimState, setClaimState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [claimError, setClaimError] = useState<string | null>(null);
  const [unlinkArmed, setUnlinkArmed] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const unlinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (unlinkTimer.current) clearTimeout(unlinkTimer.current);
    };
  }, []);

  if (!leader) return null;

  const isStaff = role !== 'leader';
  const canEdit = isStaff || leader.isOwn;

  async function requestClaim(id: string) {
    setClaimState('sending');
    setClaimError(null);
    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bibleTalkId: id }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setClaimError(
          CLAIM_ERROR_MESSAGES[data.error ?? ''] || 'Request failed. Please try again.',
        );
        setClaimState('idle');
        return;
      }
      setClaimState('sent');
    } catch {
      setClaimError('Network error. Please try again.');
      setClaimState('idle');
    }
  }

  async function unlinkLeader(id: string) {
    if (!unlinkArmed) {
      setUnlinkArmed(true);
      if (unlinkTimer.current) clearTimeout(unlinkTimer.current);
      unlinkTimer.current = setTimeout(() => setUnlinkArmed(false), 4000);
      return;
    }
    if (unlinkTimer.current) clearTimeout(unlinkTimer.current);
    setUnlinking(true);
    setUnlinkError(null);
    try {
      const res = await fetch(`/api/locations/${id}/unlink`, { method: 'POST' });
      if (!res.ok) {
        setUnlinkError('Remove failed. Please try again.');
        return;
      }
      router.refresh();
    } catch {
      setUnlinkError('Network error. Please try again.');
    } finally {
      setUnlinking(false);
      setUnlinkArmed(false);
    }
  }

  return (
    <aside className="absolute inset-0 z-40 md:right-3 md:top-3 md:bottom-3 md:left-auto md:inset-auto md:w-96 bg-white dark:bg-zinc-900 md:rounded-lg shadow-2xl flex flex-col text-zinc-950 dark:text-zinc-50 overflow-hidden">
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold truncate">{leader.name}</h3>
          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {leader.ministry} ministry
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && (
            <button
              onClick={onEdit}
              className="px-3 py-2 md:px-2.5 md:py-1 text-xs font-medium border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-2 md:p-1 -m-1 leading-none text-lg md:text-base"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {leader.isOwn && <Pill on label="Your bible talk" />}
          <Pill on={leader.isActive} label="Active" />
          {leader.hideFromPublicMap && <Pill on warning label="Hidden from public" />}
          {leader.isPaused && <Pill on label="Paused" />}
          {!leader.isActive && <Pill on danger label="Inactive" />}
        </div>

        {!leader.redacted && (
          <>
            <Field label="Address" value={leader.address} />
            <Field
              label="Email"
              value={
                leader.email ? (
                  <a
                    href={`mailto:${leader.email}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                  >
                    {leader.email}
                  </a>
                ) : (
                  <Empty />
                )
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
          </>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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

        {isStaff && (
          <Field
            label="Admin notes (private)"
            multiline
            value={leader.adminNotes || <Empty>none</Empty>}
          />
        )}

        {!leader.redacted && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
        )}

        {/* Leader-role: claim an unowned, email-less bible talk */}
        {role === 'leader' && leader.claimable && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            {claimState === 'sent' ? (
              <div className="text-sm text-green-600 dark:text-green-400 border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded">
                Request sent — an admin will review it. Once approved, this
                bible talk will appear as yours.
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                  This bible talk has no contact email. If it&apos;s yours,
                  request it — admins will be notified to approve.
                </p>
                <button
                  type="button"
                  onClick={() => void requestClaim(leader.id)}
                  disabled={claimState === 'sending'}
                  className="w-full px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {claimState === 'sending' ? 'Sending…' : 'Claim my bibletalk'}
                </button>
                {claimError && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {claimError}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Staff: linked-leader info + unlink */}
        {isStaff && leader.linkedLeaderEmail && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-2">
            <Field
              label="Managed by"
              value={<span className="break-all">{leader.linkedLeaderEmail}</span>}
            />
            <button
              type="button"
              onClick={() => void unlinkLeader(leader.id)}
              disabled={unlinking}
              className="text-xs px-3 py-2 md:py-1.5 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
            >
              {unlinking
                ? 'Removing…'
                : unlinkArmed
                  ? 'Confirm remove leader'
                  : 'Remove leader'}
            </button>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Unlinks their account and clears this bible talk&apos;s contact
              email.
            </p>
            {unlinkError && (
              <p className="text-sm text-red-600 dark:text-red-400">{unlinkError}</p>
            )}
          </div>
        )}

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

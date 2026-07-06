'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { CommsLogEntry, MessageTemplate } from '@/lib/repos/comms';

interface Props {
  templates: MessageTemplate[];
  log: CommsLogEntry[];
  logTotal: number;
  logPage: number;
  logPageSize: number;
  activeCount: number;
  allCount: number;
}

const TEMPLATES_PER_PAGE = 10;

const inputClasses =
  'w-full px-3 py-2 md:py-1.5 border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const labelClasses =
  'block text-[10px] uppercase tracking-wider text-zinc-500 mb-1';
const primaryButtonClasses =
  'px-4 py-2 md:py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed';
const secondaryButtonClasses =
  'px-4 py-2 md:py-1.5 text-sm font-medium rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 disabled:opacity-50';
const smallButtonClasses =
  'text-xs px-3 py-2 md:py-1.5 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 disabled:opacity-50';
const dangerButtonClasses =
  'text-xs px-3 py-2 md:py-1.5 border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50';
const errorBoxClasses =
  'text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded';
const successBoxClasses =
  'text-sm text-green-600 dark:text-green-400 border border-green-300 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2 rounded';

function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 py-1 text-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 self-center">
        {label}
      </span>
      <span className="text-zinc-700 dark:text-zinc-200 min-w-0">{children}</span>
    </div>
  );
}

function StatusChip({ entry }: { entry: CommsLogEntry }) {
  if (entry.isTest) {
    return (
      <span className="text-[10px] uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
        test
      </span>
    );
  }
  if (entry.status === 'sent') {
    return (
      <span
        className="text-[10px] uppercase tracking-wide bg-green-100 dark:bg-green-950 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300"
        title={entry.error ?? undefined}
      >
        sent{entry.error ? '*' : ''}
      </span>
    );
  }
  return (
    <span
      className="text-[10px] uppercase tracking-wide bg-red-100 dark:bg-red-950 px-1.5 py-0.5 rounded text-red-700 dark:text-red-300"
      title={entry.error ?? undefined}
    >
      failed
    </span>
  );
}

// SSR-safe "am I on localhost" — false on the server, real value after
// hydration. Cosmetic only; the send route enforces the same check.
const noopSubscribe = () => () => {};
function useIsLocalHost(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => ['localhost', '127.0.0.1'].includes(window.location.hostname),
    () => false,
  );
}

const SEND_ERROR_MESSAGES: Record<string, string> = {
  local_send_disabled:
    'Real sends are disabled on localhost — use "Send test to me" instead.',
  rate_limited: 'Too many sends in the last hour. Please wait a bit.',
  no_recipients: 'No leaders with a real email match the current selection.',
  invalid_subject: 'Subject is required (max 200 characters).',
  invalid_body: 'Message is required (max 10,000 characters).',
};

export function CommsPanel({
  templates,
  log,
  logTotal,
  logPage,
  logPageSize,
  activeCount,
  allCount,
}: Props) {
  const router = useRouter();

  // Compose state
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [sending, setSending] = useState<null | 'test' | 'real'>(null);
  const [confirmArmed, setConfirmArmed] = useState(false);
  const isLocalHost = useIsLocalHost();
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Template editor state
  const [editingId, setEditingId] = useState<null | 'new' | string>(null);
  const [tName, setTName] = useState('');
  const [tSubject, setTSubject] = useState('');
  const [tBody, setTBody] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [deleteArmedId, setDeleteArmedId] = useState<string | null>(null);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
    };
  }, []);

  const recipientCount = includeInactive ? allCount : activeCount;
  const inactiveExtra = allCount - activeCount;
  const composeValid = subject.trim().length > 0 && body.trim().length > 0;

  // Templates: client-side pagination (full list stays available to the
  // compose select above).
  const [templatePage, setTemplatePage] = useState(1);
  const templatePages = Math.max(1, Math.ceil(templates.length / TEMPLATES_PER_PAGE));
  const safeTemplatePage = Math.min(templatePage, templatePages);
  const visibleTemplates = templates.slice(
    (safeTemplatePage - 1) * TEMPLATES_PER_PAGE,
    safeTemplatePage * TEMPLATES_PER_PAGE,
  );

  // History: server-side pagination via the ?hpage= URL param.
  const logPages = Math.max(1, Math.ceil(logTotal / logPageSize));

  async function doSend(testOnly: boolean) {
    setSending(testOnly ? 'test' : 'real');
    setSendError(null);
    setSendSuccess(null);
    try {
      const res = await fetch('/api/comms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
          includeInactive,
          testOnly,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipientCount?: number;
      };
      if (!res.ok) {
        setSendError(
          SEND_ERROR_MESSAGES[data.error ?? ''] ||
            'Send failed. Check the history below and try again.',
        );
        return;
      }
      if (testOnly) {
        setSendSuccess('Test email sent to you. Check your inbox.');
      } else {
        setSendSuccess(`Message sent to ${data.recipientCount} leaders.`);
        setSubject('');
        setBody('');
        setIncludeInactive(false);
      }
      router.refresh();
    } catch {
      setSendError('Network error. Please try again.');
    } finally {
      setSending(null);
      setConfirmArmed(false);
    }
  }

  function handleSendClick() {
    if (!confirmArmed) {
      setConfirmArmed(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmArmed(false), 4000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    void doSend(false);
  }

  function loadTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  }

  function openEditor(t?: MessageTemplate) {
    setTemplateError(null);
    if (t) {
      setEditingId(t.id);
      setTName(t.name);
      setTSubject(t.subject);
      setTBody(t.body);
    } else {
      setEditingId('new');
      setTName('');
      setTSubject('');
      setTBody('');
    }
  }

  async function saveTemplate() {
    setTemplateBusy(true);
    setTemplateError(null);
    try {
      const payload = {
        name: tName.trim(),
        subject: tSubject.trim(),
        body: tBody.trim(),
      };
      const res =
        editingId === 'new'
          ? await fetch('/api/comms/templates', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            })
          : await fetch(`/api/comms/templates/${editingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setTemplateError(
          data.error === 'invalid_name'
            ? 'Template name is required (max 100 characters).'
            : SEND_ERROR_MESSAGES[data.error ?? ''] || 'Save failed.',
        );
        return;
      }
      setEditingId(null);
      router.refresh();
    } catch {
      setTemplateError('Network error. Please try again.');
    } finally {
      setTemplateBusy(false);
    }
  }

  async function handleDeleteClick(id: string) {
    if (deleteArmedId !== id) {
      setDeleteArmedId(id);
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      deleteTimer.current = setTimeout(() => setDeleteArmedId(null), 4000);
      return;
    }
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    setTemplateBusy(true);
    setTemplateError(null);
    try {
      const res = await fetch(`/api/comms/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setTemplateError('Delete failed.');
        return;
      }
      if (editingId === id) setEditingId(null);
      router.refresh();
    } catch {
      setTemplateError('Network error. Please try again.');
    } finally {
      setTemplateBusy(false);
      setDeleteArmedId(null);
    }
  }

  const templateEditor = (
    <div className="mt-3 space-y-3 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
      <div>
        <label className={labelClasses}>Template name</label>
        <input
          type="text"
          value={tName}
          onChange={(e) => setTName(e.target.value)}
          className={inputClasses}
        />
      </div>
      <div>
        <label className={labelClasses}>Subject</label>
        <input
          type="text"
          value={tSubject}
          onChange={(e) => setTSubject(e.target.value)}
          className={inputClasses}
        />
      </div>
      <div>
        <label className={labelClasses}>Message</label>
        <textarea
          value={tBody}
          onChange={(e) => setTBody(e.target.value)}
          rows={5}
          className={`${inputClasses} resize-y`}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveTemplate}
          disabled={templateBusy || !tName.trim() || !tSubject.trim() || !tBody.trim()}
          className={primaryButtonClasses}
        >
          {templateBusy
            ? 'Saving…'
            : editingId === 'new'
              ? 'Create template'
              : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={() => setEditingId(null)}
          disabled={templateBusy}
          className={secondaryButtonClasses}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Compose */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
          Send a message
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
          One email, all leaders in BCC. Leaders without a real contact email
          are skipped automatically.
        </p>

        <div className="space-y-3">
          {templates.length > 0 && (
            <div>
              <label className={labelClasses}>Load a template</label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) loadTemplate(e.target.value);
                }}
                className={inputClasses}
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelClasses}>Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div>
            <label className={labelClasses}>Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className={`${inputClasses} resize-y`}
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="mt-1 rounded accent-blue-600"
            />
            <span>
              Include inactive leaders{' '}
              <span className="text-zinc-500 dark:text-zinc-400">
                (adds {inactiveExtra} more recipient{inactiveExtra === 1 ? '' : 's'})
              </span>
            </span>
          </label>

          <div className="border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 rounded-md px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200">
            This message will be emailed to{' '}
            <span className="text-base font-semibold text-blue-700 dark:text-blue-300">
              {recipientCount}
            </span>{' '}
            leader{recipientCount === 1 ? '' : 's'} in total (
            {includeInactive ? 'active + inactive' : 'active only'}).
          </div>
        </div>

        {sendError && <div className={`mt-3 ${errorBoxClasses}`}>{sendError}</div>}
        {sendSuccess && (
          <div className={`mt-3 ${successBoxClasses}`}>{sendSuccess}</div>
        )}
        {isLocalHost && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            Real sends are disabled on localhost — use &quot;Send test to
            me&quot;.
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={() => void doSend(true)}
            disabled={!composeValid || sending !== null}
            className={secondaryButtonClasses}
          >
            {sending === 'test' ? 'Sending…' : 'Send test to me'}
          </button>
          <button
            type="button"
            onClick={handleSendClick}
            disabled={!composeValid || sending !== null || isLocalHost}
            className={primaryButtonClasses}
          >
            {sending === 'real'
              ? 'Sending…'
              : confirmArmed
                ? `Confirm send to ${recipientCount} leader${recipientCount === 1 ? '' : 's'}`
                : `Send to ${recipientCount} leader${recipientCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </section>

      {/* Templates */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
            Templates
          </h2>
          {editingId === null && (
            <button
              type="button"
              onClick={() => openEditor()}
              className={smallButtonClasses}
            >
              New template
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Reusable messages you can load into the form above.
        </p>

        {templateError && (
          <div className={`mb-3 ${errorBoxClasses}`}>{templateError}</div>
        )}

        {editingId === 'new' && templateEditor}

        {templates.length === 0 && editingId === null && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No templates yet.
          </p>
        )}

        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {visibleTemplates.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {t.name}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {t.subject}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadTemplate(t.id)}
                    className={smallButtonClasses}
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditor(t)}
                    className={smallButtonClasses}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteClick(t.id)}
                    disabled={templateBusy}
                    className={dangerButtonClasses}
                  >
                    {deleteArmedId === t.id ? 'Confirm delete' : 'Delete'}
                  </button>
                </div>
              </div>
              {editingId === t.id && templateEditor}
            </li>
          ))}
        </ul>

        {templatePages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              Page {safeTemplatePage} of {templatePages} ({templates.length} templates)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTemplatePage(safeTemplatePage - 1)}
                disabled={safeTemplatePage <= 1}
                className={smallButtonClasses}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setTemplatePage(safeTemplatePage + 1)}
                disabled={safeTemplatePage >= templatePages}
                className={smallButtonClasses}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* History */}
      <section className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-5">
        <h2 className="text-base font-semibold mb-1 text-zinc-950 dark:text-zinc-50">
          History
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
          Every send, {logPageSize} per page, newest first.
        </p>

        {log.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nothing sent yet.
          </p>
        ) : (
          <>
            {/* Mobile: card list */}
            <div className="md:hidden space-y-3">
              {log.map((e) => (
                <div
                  key={e.id}
                  className="border border-zinc-100 dark:border-zinc-800 rounded-xl p-3"
                >
                  <CardRow label="When">
                    <span className="text-xs text-zinc-500">
                      {new Date(e.createdAt).toLocaleString()}
                    </span>
                  </CardRow>
                  <CardRow label="Subject">
                    <span className="break-words">{e.subject}</span>
                  </CardRow>
                  <CardRow label="Recipients">{e.recipientCount}</CardRow>
                  <CardRow label="Sent by">
                    <span className="break-all text-xs">
                      {e.sentByEmail || <span className="text-zinc-400">—</span>}
                    </span>
                  </CardRow>
                  <CardRow label="Status">
                    <StatusChip entry={e} />
                  </CardRow>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-hidden rounded-lg border border-zinc-100 dark:border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">When</th>
                    <th className="text-left px-3 py-2 font-medium">Subject</th>
                    <th className="text-right px-3 py-2 font-medium">
                      Recipients
                    </th>
                    <th className="text-left px-3 py-2 font-medium">Sent by</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((e) => (
                    <tr
                      key={e.id}
                      className="border-t border-zinc-100 dark:border-zinc-800"
                    >
                      <td className="px-3 py-2 text-zinc-500 text-xs whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200 max-w-xs">
                        <div className="truncate" title={e.subject}>
                          {e.subject}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-700 dark:text-zinc-200">
                        {e.recipientCount}
                      </td>
                      <td className="px-3 py-2 text-zinc-500 text-xs">
                        {e.sentByEmail || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <StatusChip entry={e} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {logPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Page {logPage} of {logPages} ({logTotal} sends)
                </span>
                <div className="flex gap-2">
                  {logPage > 1 ? (
                    <Link
                      href={`/admin/comms?hpage=${logPage - 1}`}
                      className={smallButtonClasses}
                    >
                      Previous
                    </Link>
                  ) : (
                    <span aria-hidden className={`${smallButtonClasses} opacity-50 pointer-events-none`}>
                      Previous
                    </span>
                  )}
                  {logPage < logPages ? (
                    <Link
                      href={`/admin/comms?hpage=${logPage + 1}`}
                      className={smallButtonClasses}
                    >
                      Next
                    </Link>
                  ) : (
                    <span aria-hidden className={`${smallButtonClasses} opacity-50 pointer-events-none`}>
                      Next
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

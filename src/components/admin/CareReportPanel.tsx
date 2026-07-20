'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CARE_STAGE_LABELS,
  CARE_STAGES,
  CARE_TYPES,
  CARE_TYPE_LABELS,
  type CareType,
} from '@/lib/care-stages';
import { downloadCsv, todayStamp } from '@/lib/export';
import type { CareTalkOption } from '@/lib/types';

export interface CareReportRow {
  id: string;
  talkLabel: string;
  type: CareType;
  stage: string;
  personName: string | null;
  contact: string | null;
  details: string | null;
  outcome: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface MatrixRow {
  bibleTalkId: string | null;
  talkLabel: string;
  countsByType: Record<CareType, number>;
  total: number;
}

interface Filters {
  talk: string;
  type: CareType | '';
  stage: string;
  archived: boolean;
}

interface Props {
  rows: CareReportRow[];
  matrix: MatrixRow[];
  talkOptions: CareTalkOption[];
  filters: Filters;
}

const selectClasses =
  'text-xs px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200';

const thClasses = 'text-left px-3 py-2 font-medium';
const tdClasses = 'px-3 py-2 text-zinc-700 dark:text-zinc-200 align-top';

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '';
}

const DETAIL_COLUMNS = [
  'Talk',
  'Type',
  'Stage',
  'Person',
  'Contact',
  'Details',
  'Outcome',
  'Created',
  'Archived',
];

function detailCells(r: CareReportRow): (string | null)[] {
  return [
    r.talkLabel,
    CARE_TYPE_LABELS[r.type],
    CARE_STAGE_LABELS[r.stage] ?? r.stage,
    r.personName,
    r.contact,
    r.details,
    r.outcome,
    fmtDate(r.createdAt),
    fmtDate(r.archivedAt),
  ];
}

export function CareReportPanel({ rows, matrix, talkOptions, filters }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pdfPending, setPdfPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function logExport(format: 'csv' | 'pdf') {
    // Fire-and-forget — an audit hiccup must never block the download.
    void fetch('/api/care/export-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, count: rows.length, filters }),
    }).catch(() => {});
  }

  function exportCsv() {
    downloadCsv(DETAIL_COLUMNS, rows.map(detailCells), `care-report-${todayStamp()}.csv`);
    logExport('csv');
  }

  async function exportPdf() {
    setPdfPending(true);
    setExportError(null);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('Care Report', 14, 16);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(
        `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} — exported ${todayStamp()}`,
        14,
        22,
      );
      // Summary block: active counts by talk × type.
      autoTable(doc, {
        startY: 28,
        head: [['Talk', ...CARE_TYPES.map((t) => CARE_TYPE_LABELS[t]), 'Total']],
        body: matrix.map((m) => [
          m.talkLabel,
          ...CARE_TYPES.map((t) => String(m.countsByType[t] || 0)),
          String(m.total),
        ]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [63, 63, 70] },
      });
      // Detail rows, honoring the on-screen filters.
      const { lastAutoTable } = doc as unknown as { lastAutoTable?: { finalY: number } };
      autoTable(doc, {
        startY: lastAutoTable ? lastAutoTable.finalY + 8 : 28,
        head: [DETAIL_COLUMNS],
        body: rows.map((r) => detailCells(r).map((c) => c ?? '')),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [63, 63, 70] },
        columnStyles: { 5: { cellWidth: 60 }, 6: { cellWidth: 40 } },
      });
      doc.save(`care-report-${todayStamp()}.pdf`);
      logExport('pdf');
    } catch {
      setExportError('PDF generation failed. Please try again.');
    } finally {
      setPdfPending(false);
    }
  }

  function setParams(next: Partial<Filters>) {
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
    router.push(qs ? `/admin/care/report?${qs}` : '/admin/care/report');
  }

  const stageOptions = filters.type ? CARE_STAGES[filters.type] : [];
  const typeTotals = CARE_TYPES.map((t) =>
    matrix.reduce((sum, m) => sum + m.countsByType[t], 0),
  );
  const grandTotal = matrix.reduce((sum, m) => sum + m.total, 0);

  return (
    <div className="space-y-6">
      {/* Summary: talks × care types, active entries only */}
      <section>
        <h2 className="text-sm font-semibold mb-2 text-zinc-700 dark:text-zinc-200">
          Active entries by talk
        </h2>
        <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[36rem]">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className={thClasses}>Talk</th>
                {CARE_TYPES.map((t) => (
                  <th key={t} className={`${thClasses} text-right`}>
                    {CARE_TYPE_LABELS[t]}
                  </th>
                ))}
                <th className={`${thClasses} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((m) => (
                <tr
                  key={m.bibleTalkId ?? 'unassigned'}
                  className="border-t border-zinc-100 dark:border-zinc-800"
                >
                  <td className={`${tdClasses} font-medium`}>{m.talkLabel}</td>
                  {CARE_TYPES.map((t) => (
                    <td key={t} className={`${tdClasses} text-right tabular-nums`}>
                      {m.countsByType[t] || '—'}
                    </td>
                  ))}
                  <td className={`${tdClasses} text-right tabular-nums font-medium`}>
                    {m.total}
                  </td>
                </tr>
              ))}
              {matrix.length === 0 && (
                <tr className="border-t border-zinc-100 dark:border-zinc-800">
                  <td colSpan={CARE_TYPES.length + 2} className={`${tdClasses} text-zinc-400`}>
                    No active care entries.
                  </td>
                </tr>
              )}
            </tbody>
            {matrix.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 font-medium">
                  <td className={tdClasses}>All talks</td>
                  {typeTotals.map((total, i) => (
                    <td key={CARE_TYPES[i]} className={`${tdClasses} text-right tabular-nums`}>
                      {total}
                    </td>
                  ))}
                  <td className={`${tdClasses} text-right tabular-nums`}>{grandTotal}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Detail */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200 mr-2">
            Entries
          </h2>
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
                  {CARE_STAGE_LABELS[s] ?? s}
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
            Include archived
          </label>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {rows.length} entr{rows.length === 1 ? 'y' : 'ies'}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="text-xs px-3 py-2 md:py-1.5 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={pdfPending}
              className="text-xs px-3 py-2 md:py-1.5 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
            >
              {pdfPending ? 'Generating…' : 'Export PDF'}
            </button>
          </div>
        </div>

        {exportError && (
          <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
            {exportError}
          </div>
        )}

        {/* Mobile: card list */}
        <div className="md:hidden space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-4 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-zinc-900 dark:text-zinc-100">
                  {r.personName || '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-600 dark:text-zinc-300">
                  {CARE_STAGE_LABELS[r.stage] ?? r.stage}
                </span>
              </div>
              <div className="text-zinc-500 dark:text-zinc-400 text-xs">
                {r.talkLabel} · {CARE_TYPE_LABELS[r.type]} · {fmtDate(r.createdAt)}
              </div>
              {r.contact && <div className="text-zinc-600 dark:text-zinc-300">{r.contact}</div>}
              {r.details && (
                <div className="text-zinc-700 dark:text-zinc-200 whitespace-pre-wrap break-words">
                  {r.details}
                </div>
              )}
              {r.outcome && (
                <div className="text-zinc-500 dark:text-zinc-400 italic">
                  Outcome: {r.outcome}
                </div>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 text-sm text-zinc-500 dark:text-zinc-400">
              No care entries match these filters.
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[64rem]">
            <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              <tr>
                <th className={thClasses}>Talk</th>
                <th className={thClasses}>Type</th>
                <th className={thClasses}>Stage</th>
                <th className={thClasses}>Person</th>
                <th className={thClasses}>Contact</th>
                <th className={thClasses}>Details</th>
                <th className={thClasses}>Outcome</th>
                <th className={thClasses}>Created</th>
                <th className={thClasses}>Archived</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className={`${tdClasses} whitespace-nowrap`}>{r.talkLabel}</td>
                  <td className={`${tdClasses} whitespace-nowrap`}>{CARE_TYPE_LABELS[r.type]}</td>
                  <td className={`${tdClasses} whitespace-nowrap`}>
                    {CARE_STAGE_LABELS[r.stage] ?? r.stage}
                  </td>
                  <td className={`${tdClasses} font-medium`}>{r.personName || '—'}</td>
                  <td className={tdClasses}>{r.contact || '—'}</td>
                  <td className={`${tdClasses} max-w-[18rem] whitespace-pre-wrap break-words`}>
                    {r.details || '—'}
                  </td>
                  <td className={`${tdClasses} max-w-[12rem] whitespace-pre-wrap break-words`}>
                    {r.outcome || '—'}
                  </td>
                  <td className={`${tdClasses} whitespace-nowrap`}>{fmtDate(r.createdAt)}</td>
                  <td className={`${tdClasses} whitespace-nowrap`}>{fmtDate(r.archivedAt)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr className="border-t border-zinc-100 dark:border-zinc-800">
                  <td colSpan={9} className={`${tdClasses} text-zinc-400`}>
                    No care entries match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

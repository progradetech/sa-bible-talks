'use client';

import { useState } from 'react';
import type { Ministry } from '@/lib/types';

const MINISTRY_COLORS: Record<Ministry, string> = {
  Family: '#2196F3',
  YoPro: '#FF9800',
  Campus: '#9C27B0',
  Singles: '#E91E63',
  Spanish: '#4CAF50',
};

export interface LeaderRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  ministry: Ministry;
}

interface Props {
  rows: LeaderRow[];
}

function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2 py-1 text-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 self-center">
        {label}
      </span>
      <span className="text-zinc-700 dark:text-zinc-200 min-w-0">{children}</span>
    </div>
  );
}

function MinistryLabel({ ministry }: { ministry: Ministry }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: MINISTRY_COLORS[ministry] }}
      />
      {ministry}
    </span>
  );
}

function csvEscape(value: string | null): string {
  const s = value ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function LeadersTable({ rows }: Props) {
  const [pdfPending, setPdfPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function logExport(format: 'csv' | 'pdf') {
    // Fire-and-forget — an audit hiccup must never block the download.
    void fetch('/api/leaders/export-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format, count: rows.length }),
    }).catch(() => {});
  }

  function exportCsv() {
    const lines = [
      'Name,Email,Phone,Ministry',
      ...rows.map((r) =>
        [r.name, r.email ?? '-', r.phone, r.ministry].map(csvEscape).join(','),
      ),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    downloadBlob(blob, `bible-talk-leaders-${todayStamp()}.csv`);
    logExport('csv');
  }

  async function exportPdf() {
    setPdfPending(true);
    setError(null);
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([
        import('jspdf'),
        import('jspdf-autotable'),
      ]);
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('SA Bible Talk Leaders', 14, 16);
      doc.setFontSize(10);
      doc.setTextColor(120);
      doc.text(
        `${rows.length} leader${rows.length === 1 ? '' : 's'} — exported ${todayStamp()}`,
        14,
        22,
      );
      autoTable(doc, {
        startY: 28,
        head: [['Name', 'Email', 'Phone', 'Ministry']],
        body: rows.map((r) => [r.name, r.email ?? '-', r.phone ?? '', r.ministry]),
        styles: { fontSize: 9 },
        headStyles: { fillColor: [63, 63, 70] },
      });
      doc.save(`bible-talk-leaders-${todayStamp()}.pdf`);
      logExport('pdf');
    } catch {
      setError('PDF generation failed. Please try again.');
    } finally {
      setPdfPending(false);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-6 text-sm text-zinc-500 dark:text-zinc-400">
        No leaders yet. Add one from the map page.
      </div>
    );
  }

  const exportButtonClasses =
    'text-xs px-3 py-2 md:py-1.5 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 disabled:opacity-50';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {rows.length} leader{rows.length === 1 ? '' : 's'}
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={exportCsv} className={exportButtonClasses}>
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportPdf}
            disabled={pdfPending}
            className={exportButtonClasses}
          >
            {pdfPending ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {/* Mobile: card list */}
      <div className="md:hidden space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="bg-white dark:bg-zinc-900 rounded-xl shadow-sm p-4">
            <CardRow label="Name">
              <span className="font-medium break-words">{r.name}</span>
            </CardRow>
            <CardRow label="Email">
              {r.email ? (
                <a
                  href={`mailto:${r.email}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline break-all"
                >
                  {r.email}
                </a>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </CardRow>
            <CardRow label="Phone">
              {r.phone ? (
                <a
                  href={`tel:${r.phone}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {r.phone}
                </a>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </CardRow>
            <CardRow label="Ministry">
              <MinistryLabel ministry={r.ministry} />
            </CardRow>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Name</th>
              <th className="text-left px-3 py-2 font-medium">Email</th>
              <th className="text-left px-3 py-2 font-medium">Phone</th>
              <th className="text-left px-3 py-2 font-medium">Ministry</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                  {r.name}
                </td>
                <td className="px-3 py-2">
                  {r.email ? (
                    <a
                      href={`mailto:${r.email}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {r.email}
                    </a>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.phone ? (
                    <a
                      href={`tel:${r.phone}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {r.phone}
                    </a>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-200">
                  <MinistryLabel ministry={r.ministry} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

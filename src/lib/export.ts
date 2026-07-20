// Client-side export helpers shared by the Leaders directory and the Care
// report. Browser-only (creates DOM nodes) — import from client components.

export function csvEscape(value: string | null): string {
  const s = value ?? '';
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(headerRow: string[], rows: (string | null)[][], filename: string) {
  const lines = [
    headerRow.map(csvEscape).join(','),
    ...rows.map((r) => r.map(csvEscape).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, filename);
}

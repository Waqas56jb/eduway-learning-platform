/** Build and download CSV in the browser. A UTF-8 BOM is added so Excel reads Arabic correctly. */
export function toCsv(rows: Record<string, unknown>[], columns?: { key: string; header: string }[]) {
  const cols = columns ?? Object.keys(rows[0] ?? {}).map((k) => ({ key: k, header: k }));
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.map((c) => esc(c.header)).join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c.key])).join(',')).join('\n');
  return `${head}\n${body}`;
}

export function downloadFile(content: string, filename: string, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: { key: string; header: string }[],
) {
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(toCsv(rows, columns), `${filename}-${stamp}.csv`);
}

/**
 * Server-side table exports (API_CONTRACT §0.7): CSV (UTF-8 with BOM) or XLSX (exceljs), always logged in
 * eduway_platform_exports_log and audited as `export.create`.
 *
 *   return sendExport(ctx.req, ctx.res, {
 *     report: 'students', format: body.format, columns: STUDENT_COLUMNS, selected: body.columns,
 *     rows: rows.map(toExportRow), filters: body.filters,
 *   });
 * Route must be declared with `raw: true`.
 */
import ExcelJS from 'exceljs';
import type { Request, Response } from 'express';
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { z } from '../validation/zod.js';
import { auditService } from './audit.js';

export const exportRequest = z.object({
  format: z.enum(['csv', 'xlsx']),
  filters: z.record(z.unknown()).optional(),
  ids: z.array(z.string().uuid()).max(5000).optional(),
  columns: z.array(z.string()).optional(),
});
export type ExportRequest = z.infer<typeof exportRequest>;

export interface ExportColumn<R> {
  key: string;
  header: string;
  value: (row: R) => string | number | boolean | null | undefined;
}

const BOM = String.fromCharCode(0xfeff);

/** SEC-15: neutralise spreadsheet formulas (CSV/XLSX injection) in user-controlled text — `=`, `+`, `-`, `@`, TAB, CR. */
export function neutralizeFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
}

export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? neutralizeFormula(v) : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function buildExport<R>(format: 'csv' | 'xlsx', columns: ExportColumn<R>[], rows: R[], sheetName = 'Export'): Promise<Buffer> {
  if (format === 'csv') {
    const lines = [columns.map((c) => csvCell(c.header)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => csvCell(c.value(r))).join(','));
    return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8');
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EDUWAY';
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: Math.max(12, c.header.length + 2) }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(r) ?? ''])));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export interface SendExportOptions<R> {
  report: string;
  format: 'csv' | 'xlsx';
  columns: ExportColumn<R>[];
  /** Ordered subset of column keys requested by the client. */
  selected?: string[];
  rows: R[];
  filters?: Record<string, unknown>;
  from?: string | null;
  to?: string | null;
}

export async function sendExport<R>(req: Request, res: Response, o: SendExportOptions<R>): Promise<void> {
  const cols = o.selected?.length ? o.selected.map((k) => o.columns.find((c) => c.key === k)).filter((c): c is ExportColumn<R> => !!c) : o.columns;
  const buf = await buildExport(o.format, cols.length ? cols : o.columns, o.rows, o.report);
  const date = new Date().toISOString().slice(0, 10);
  const fileName = `${o.report}-${date}.${o.format}`;
  await db.query(
    `INSERT INTO ${T.exports_log} (report, format, range_from, range_to, filters, row_count, columns, status, file_name, actor_id, actor_name, completed_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'ready',$8,$9,$10, now())`,
    [o.report, o.format, o.from?.slice(0, 10) ?? null, o.to?.slice(0, 10) ?? null, JSON.stringify(o.filters ?? {}), o.rows.length, cols.map((c) => c.key), fileName, req.admin?.userId ?? null, req.admin?.name ?? ''],
  );
  await auditService.fromRequest(req, { action: 'export.create', entity: 'export', entityId: o.report, summary: `Exported ${o.rows.length} ${o.report} rows (${o.format})`, after: { report: o.report, format: o.format, rows: o.rows.length } });
  res.setHeader('Content-Type', o.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(buf);
}

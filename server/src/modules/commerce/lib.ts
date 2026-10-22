/**
 * Shared helpers for Agent C modules (packages, promotions, subscriptions, payments, schools, marketers,
 * incentives, settlements, analytics). Not a mounted module — a library folder.
 */
import type { Request, Response } from 'express';
import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { BusinessRuleError } from '../../common/errors/index.js';
import type { Localized } from '../../common/i18n/index.js';
import { auditService } from '../../common/services/audit.js';
import { buildExport, type ExportColumn } from '../../common/services/exporter.js';
import { randomCode } from '../../common/utils/crypto.js';
import { notify } from '../notifications/notify.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';

export type Row = Record<string, unknown>;

/** `{ name_en, name_ar }` → `{ en, ar }` (ar falls back to en). */
export function L(r: Row, field: string): Localized {
  const en = String(r[`${field}_en`] ?? '');
  const ar = String(r[`${field}_ar`] ?? '');
  return { en, ar: ar || en };
}

export const isoOrNull = (v: unknown): string | null => (v ? new Date(v as string | Date).toISOString() : null);
export const iso = (v: unknown): string => new Date(v as string | Date).toISOString();
export const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Categorical palette for charts (packages, sources, marketers…). */
export const PALETTE = ['#2563EB', '#16A34A', '#F59E0B', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#475569'];
export const colorAt = (i: number) => PALETTE[i % PALETTE.length] as string;

/** Governorate slug → uuid (422 GOVERNORATE_INVALID). */
export async function governorateUuid(slug: string, ex?: Executor): Promise<string> {
  const id = await db.scalar<string>(`SELECT id FROM ${T.governorates} WHERE code = $1`, [slug], ex);
  if (!id) throw new BusinessRuleError('GOVERNORATE_INVALID', { governorateId: slug });
  return id;
}

/** Transaction ref `EDW-XXXX-XXXX`. */
export const newPaymentRef = () => `EDW-${randomCode(4)}-${randomCode(4)}`;
/** Receipt number `R-XXXX-XXXX`. */
export const newReceiptNumber = () => `R-${randomCode(4)}-${randomCode(4)}`;

/** Inclusive ISO range helpers in the business timezone. */
export function businessDay(d: Date | string): string {
  return dayjs(d).tz(BUSINESS_TZ).format('YYYY-MM-DD');
}
export function startOfBusinessDay(day: string): Date {
  return dayjs.tz(day, BUSINESS_TZ).startOf('day').toDate();
}

/** Pick a sort key: unknown keys are ignored (fallback). Returns `{ key, desc }`. */
export function parseSort(sort: string | undefined, allowed: readonly string[], fallback: string): { key: string; desc: boolean } {
  const pick = (s: string) => {
    const desc = s.startsWith('-');
    const key = desc ? s.slice(1) : s;
    return allowed.includes(key) ? { key, desc } : null;
  };
  return pick(sort ?? '') ?? (pick(fallback) as { key: string; desc: boolean });
}

/** In-memory sort + paginate (small admin lists computed in JS). */
export function sortRows<R>(rows: R[], sort: { key: string; desc: boolean }, get: (r: R, key: string) => unknown): R[] {
  const dir = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = get(a, sort.key);
    const vb = get(b, sort.key);
    if (va === vb) return 0;
    if (va === null || va === undefined) return 1;
    if (vb === null || vb === undefined) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

export function pageOf<R>(rows: R[], page: number, pageSize: number) {
  return { items: rows.slice((page - 1) * pageSize, page * pageSize), meta: { page, pageSize, total: rows.length, nextCursor: null } };
}

// ── table exports (API_CONTRACT §0.7): logged + stored for re-download from the Exports history ────────

export interface TableExportOptions<R> {
  report: string;
  format: 'csv' | 'xlsx';
  columns: ExportColumn<R>[];
  selected?: string[];
  rows: R[];
  filters?: Record<string, unknown>;
  from?: string | null;
  to?: string | null;
  source?: 'table' | 'exports_page';
}

export const CONTENT_TYPES = { csv: 'text/csv; charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;

/** Build + log (exports_log with file bytes) + audit. Returns the stored record id and buffer. */
export async function storeExport<R>(req: Request, o: TableExportOptions<R>): Promise<{ id: string; buf: Buffer; fileName: string }> {
  const cols = o.selected?.length ? o.selected.map((k) => o.columns.find((c) => c.key === k)).filter((c): c is ExportColumn<R> => !!c) : o.columns;
  const use = cols.length ? cols : o.columns;
  const buf = await buildExport(o.format, use, o.rows, o.report);
  const fileName = `${o.report}-${new Date().toISOString().slice(0, 10)}.${o.format}`;
  const id = await db.scalar<string>(
    `INSERT INTO ${T.exports_log} (report, format, range_from, range_to, filters, row_count, columns, status, file_name, actor_id, actor_name,
                                   completed_at, source, file_data, content_type, expires_at)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'ready',$8,$9,$10, now(), $11, $12, $13, now() + interval '30 days') RETURNING id`,
    [o.report, o.format, o.from?.slice(0, 10) ?? null, o.to?.slice(0, 10) ?? null, JSON.stringify(o.filters ?? {}), o.rows.length, use.map((c) => c.key), fileName,
      req.admin?.userId ?? null, req.admin?.name ?? '', o.source ?? 'table', buf, CONTENT_TYPES[o.format]],
  );
  await auditService.fromRequest(req, {
    action: 'export.create',
    entity: 'export',
    entityId: id,
    summary: `Exported ${o.rows.length} ${o.report} rows (${o.format.toUpperCase()}${o.from ? `, ${o.from.slice(0, 10)} – ${(o.to ?? '').slice(0, 10)}` : ''})`,
    after: { report: o.report, format: o.format, rows: o.rows.length, filters: o.filters ?? {} },
  });
  return { id: id as string, buf, fileName };
}

export function sendFile(res: Response, buf: Buffer, fileName: string, contentType: string): void {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.status(200).send(buf);
}

/** Table export endpoint helper (route must be `raw: true`). */
export async function sendTableExport<R>(req: Request, res: Response, o: TableExportOptions<R>): Promise<void> {
  const { buf, fileName } = await storeExport(req, o);
  sendFile(res, buf, fileName, CONTENT_TYPES[o.format]);
}

// ── student notifications: delegated to the notifications module (admin templates, prefs, push/SMS fan-out) ──

export interface NotifyInput {
  userId: string;
  type: 'payment' | 'subscription' | 'system';
  /** Notification template TYPE (e.g. payment_confirmation, subscription_expiry). */
  templateType?: 'payment_confirmation' | 'subscription_expiry';
  vars?: Record<string, string | number>;
  fallback: { title: Localized; body: Localized };
  link?: string | null;
}

/** Transactional notification via notifications/notify.ts. Never throws; call AFTER the transaction commits. */
export async function notifyStudent(n: NotifyInput): Promise<void> {
  try {
    await notify({
      userId: n.userId,
      templateType: n.templateType,
      channels: ['in_app', 'push'],
      vars: n.vars,
      fallback: n.fallback,
      notificationType: n.type,
      link: n.link ?? null,
      target: { kind: n.link === '/subscription' ? 'subscription' : 'none', id: null },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId: n.userId }, 'notifyStudent failed');
  }
}

/** `__none` filter helper. */
export const NONE = '__none';

/** Exports page (ADM-EXP-01..04): report generation (CSV/XLSX), permission-gated, logged in exports_log. */
import type { Request } from 'express';
import { T, type PermissionKey } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/index.js';
import { assertPermission } from '../../common/middleware/rbac.js';
import { buildExport, type ExportColumn } from '../../common/services/exporter.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { BUSINESS_TZ, dayjs } from '../../common/utils/dates.js';
import { CONTENT_TYPES, iso, isoOrNull, L, pageOf, parseSort, sortRows, storeExport, type Row } from '../commerce/lib.js';
import { adminPayments } from '../payments/admin.service.js';
import { schoolsService } from '../schools/service.js';
import { studentsService } from '../students/index.js';
import { analyticsService } from './service.js';

export const REPORTS = ['students', 'transactions', 'refunds', 'schools', 'learning', 'ai', 'audit'] as const;
export type Report = (typeof REPORTS)[number];

/** Extra module permission per report (besides analytics.export). */
export const REPORT_PERMISSION: Partial<Record<Report, PermissionKey>> = { students: 'users.view', transactions: 'payments.view', refunds: 'payments.view', audit: 'security.view' };

const INLINE_LIMIT = 50_000;

type Generic = Record<string, string | number | null>;
const cols = (keys: string[]): ExportColumn<Generic>[] => keys.map((k) => ({ key: k, header: k, value: (r: Generic) => r[k] ?? null }));

const instants = (from: string, to: string) => ({
  t0: dayjs(from).tz(BUSINESS_TZ).startOf('day').toDate(),
  t1: dayjs(to).tz(BUSINESS_TZ).add(1, 'day').startOf('day').toDate(),
});

/** Rows + columns for a report (API_CONTRACT §34.6). */
export async function reportRows(report: Report, from: string, to: string): Promise<{ columns: ExportColumn<Generic>[]; rows: Generic[] }> {
  const { t0, t1 } = instants(from, to);
  switch (report) {
    case 'students': {
      const r = await studentsService.list({ createdFrom: t0.toISOString(), createdTo: new Date(t1.getTime() - 1).toISOString() }, 'u.created_at DESC', 1_000_000, 0);
      return {
        columns: cols(['id', 'name_en', 'name_ar', 'mobile', 'governorate', 'school', 'package', 'subscription', 'source', 'platform', 'created']),
        rows: r.items.map((s) => ({ id: s.id, name_en: s.name.en, name_ar: s.name.ar, mobile: s.mobile, governorate: s.governorate?.name.en ?? '', school: s.school?.name.en ?? s.schoolName ?? '', package: s.package?.name.en ?? '', subscription: s.subscriptionStatus, source: s.source, platform: s.platforms.join('|'), created: s.createdAt })),
      };
    }
    case 'transactions': {
      const r = await adminPayments.list({ from: t0.toISOString(), to: new Date(t1.getTime() - 1).toISOString() }, '-createdAt', 1_000_000, 0);
      return {
        columns: cols(['ref', 'student', 'package', 'amount', 'discount', 'currency', 'gateway', 'status', 'refunded', 'promo', 'school', 'platform', 'created']),
        rows: r.items.map((x) => ({ ref: x.ref, student: x.student.name.en, package: x.package.name.en, amount: x.amount, discount: x.discount, currency: x.currency, gateway: x.gateway, status: x.status, refunded: x.refundedAmount, promo: x.promoCode, school: x.school?.name.en ?? '', platform: x.platform, created: x.createdAt })),
      };
    }
    case 'refunds': {
      const r = await adminPayments.listRefunds({ from: t0.toISOString(), to: new Date(t1.getTime() - 1).toISOString() }, '-requestedAt', 1_000_000, 0);
      return {
        columns: cols(['id', 'transaction', 'student', 'amount', 'kind', 'reason', 'status', 'requested_by', 'requested_at', 'decided_by', 'decided_at']),
        rows: r.items.map((x) => ({ id: x.id, transaction: x.ref, student: x.student.name.en, amount: x.amount, kind: x.kind, reason: x.reason, status: x.status, requested_by: x.requestedBy?.name.en ?? '', requested_at: x.requestedAt, decided_by: x.decidedBy?.name.en ?? '', decided_at: x.decidedAt })),
      };
    }
    case 'schools': {
      const [schools, period] = await Promise.all([
        schoolsService.all(),
        db.many<{ school_id: string; paid: number; revenue: number }>(
          `SELECT school_id, count(DISTINCT user_id)::int AS paid, COALESCE(sum(total), 0)::bigint AS revenue FROM ${T.payments}
            WHERE school_id IS NOT NULL AND status IN ('paid', 'partially_refunded') AND paid_at >= $1 AND paid_at < $2 GROUP BY 1`,
          [t0, t1],
        ),
      ]);
      return {
        columns: cols(['code', 'school', 'governorate', 'status', 'tier', 'paid_students_in_period', 'revenue_in_period', 'verified_paid_students', 'pending_settlement_iqd']),
        rows: schools.map((s) => {
          const p = period.find((x) => x.school_id === s.id);
          return { code: s.code, school: s.name.en, governorate: s.governorate.name.en, status: s.status, tier: s.tier, paid_students_in_period: p?.paid ?? 0, revenue_in_period: Number(p?.revenue ?? 0), verified_paid_students: s.verifiedPaidStudents, pending_settlement_iqd: s.pendingSettlement };
        }),
      };
    }
    case 'learning': {
      const days = await analyticsService.daily({ from: t0.toISOString(), to: new Date(t1.getTime() - 1).toISOString(), fields: ['dau', 'wau', 'mau', 'watchMinutes', 'videoCompletionRate', 'quizAttempts', 'quizCompletionRate', 'examAttempts'] });
      return {
        columns: cols(['date', 'dau', 'wau', 'mau', 'watch_minutes', 'video_completion_pct', 'quiz_attempts', 'quiz_completion_pct', 'exam_attempts']),
        rows: days
          .filter((d) => Number(d.dau) || Number(d.watchMinutes) || Number(d.quizAttempts) || Number(d.examAttempts))
          .map((d) => ({ date: String(d.date), dau: Number(d.dau), wau: Number(d.wau), mau: Number(d.mau), watch_minutes: Number(d.watchMinutes), video_completion_pct: Number(d.videoCompletionRate), quiz_attempts: Number(d.quizAttempts), quiz_completion_pct: Number(d.quizCompletionRate), exam_attempts: Number(d.examAttempts) })),
      };
    }
    case 'ai': {
      const days = await analyticsService.daily({ from: t0.toISOString(), to: new Date(t1.getTime() - 1).toISOString(), fields: ['aiQuestions', 'aiActiveUsers', 'aiTokens', 'aiCostUsd', 'aiBySubject'] });
      const slugs = (await db.many<{ slug: string }>(`SELECT slug FROM ${T.subjects} WHERE deleted_at IS NULL ORDER BY sort_order`)).map((s) => s.slug);
      return {
        columns: cols(['date', 'questions', 'active_users', 'tokens', 'cost_usd', ...slugs.map((s) => `q_${s}`)]),
        rows: days
          .filter((d) => Number(d.aiQuestions) > 0)
          .map((d) => ({ date: String(d.date), questions: Number(d.aiQuestions), active_users: Number(d.aiActiveUsers), tokens: Number(d.aiTokens), cost_usd: Number(d.aiCostUsd), ...Object.fromEntries(slugs.map((s) => [`q_${s}`, Number((d.aiBySubject as Record<string, number> | undefined)?.[s] ?? 0)])) })),
      };
    }
    case 'audit': {
      const rows = await db.many<Row>(`SELECT * FROM ${T.audit_logs} WHERE created_at >= $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 1000000`, [t0, t1]);
      return {
        columns: cols(['at', 'actor', 'role', 'action', 'entity', 'entity_id', 'summary', 'ip', 'device']),
        rows: rows.map((a) => ({ at: iso(a.created_at), actor: String(a.actor_name ?? ''), role: String(a.actor_role ?? ''), action: String(a.action), entity: String(a.entity), entity_id: (a.entity_id as string | null) ?? '', summary: String(a.summary ?? ''), ip: (a.ip as string | null) ?? '', device: (a.device as string | null) ?? '' })),
      };
    }
  }
}

const rangeLabel = (from: unknown, to: unknown) => (from && to ? `${dayjs(String(from)).format('D MMM YYYY')} – ${dayjs(String(to)).format('D MMM YYYY')}` : '');

export function toExportRecord(r: Row) {
  return {
    id: String(r.id),
    report: String(r.report),
    format: r.format as 'csv' | 'xlsx',
    range: rangeLabel(r.range_from, r.range_to),
    from: r.range_from ? dayjs.tz(String(r.range_from), BUSINESS_TZ).toDate().toISOString() : null,
    to: r.range_to ? dayjs.tz(String(r.range_to), BUSINESS_TZ).endOf('day').toDate().toISOString() : null,
    rows: Number(r.row_count),
    by: r.u_id ? { id: String(r.u_id), name: L(r, 'u_name'), avatarUrl: (r.u_avatar_url as string | null) ?? null } : { id: String(r.actor_id ?? ''), name: { en: String(r.actor_name ?? ''), ar: String(r.actor_name ?? '') }, avatarUrl: null },
    at: iso(r.created_at),
    status: (r.status === 'queued' ? 'processing' : r.status) as 'ready' | 'processing' | 'failed',
    source: (r.source ?? 'table') as 'exports_page' | 'table',
    downloadUrl: r.has_file && r.status === 'ready' ? `/api/v1/admin/exports/${String(r.id)}/download` : null,
    expiresAt: isoOrNull(r.expires_at),
  };
}

const LIST_SELECT = `
  SELECT e.id, e.report, e.format, e.range_from::text AS range_from, e.range_to::text AS range_to, e.row_count, e.status, e.source, e.created_at, e.expires_at, e.actor_id, e.actor_name,
         (e.file_data IS NOT NULL) AS has_file, u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.avatar_url AS u_avatar_url
    FROM ${T.exports_log} e LEFT JOIN ${T.users} u ON u.id = e.actor_id`;

export const exportsService = {
  assertReportAccess(admin: AdminPrincipal, report: Report) {
    const extra = REPORT_PERMISSION[report];
    if (extra) assertPermission(admin, extra);
  },

  async preview(report: Report, from: string, to: string) {
    return { rows: (await reportRows(report, from, to)).rows.length };
  },

  async generate(req: Request, body: { report: Report; from: string; to: string; format: 'csv' | 'xlsx' }) {
    const { columns, rows } = await reportRows(body.report, body.from, body.to);
    if (!rows.length) throw new BusinessRuleError('NO_ROWS', { report: body.report });
    if (rows.length <= INLINE_LIMIT) {
      const { id } = await storeExport(req, { report: body.report, format: body.format, columns, rows, from: body.from, to: body.to, source: 'exports_page', filters: { from: body.from, to: body.to } });
      return this.get(id);
    }
    // Large export: logged as processing, built in the background, then marked ready.
    const id = (await db.scalar<string>(
      `INSERT INTO ${T.exports_log} (report, format, range_from, range_to, filters, row_count, columns, status, actor_id, actor_name, source, content_type)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,'processing',$8,$9,'exports_page',$10) RETURNING id`,
      [body.report, body.format, body.from.slice(0, 10), body.to.slice(0, 10), JSON.stringify({ from: body.from, to: body.to }), rows.length, columns.map((c) => c.key), req.admin?.userId ?? null, req.admin?.name ?? '', CONTENT_TYPES[body.format]],
    )) as string;
    req.audit = { action: 'export.create', entity: 'export', entityId: id, summary: `Exported ${rows.length} ${body.report} rows (${body.format.toUpperCase()}, ${body.from.slice(0, 10)} – ${body.to.slice(0, 10)})`, after: { report: body.report, rows: rows.length } };
    setImmediate(() => {
      buildExport(body.format, columns, rows, body.report)
        .then((buf) => db.query(`UPDATE ${T.exports_log} SET status = 'ready', file_data = $2, file_name = $3, completed_at = now(), expires_at = now() + interval '30 days' WHERE id = $1`, [id, buf, `${body.report}-${new Date().toISOString().slice(0, 10)}.${body.format}`]))
        .catch((err: Error) => {
          logger.error({ err: err.message, id }, 'background export failed');
          return db.query(`UPDATE ${T.exports_log} SET status = 'failed', error = $2 WHERE id = $1`, [id, err.message.slice(0, 500)]);
        });
    });
    return this.get(id);
  },

  async get(id: string) {
    const r = await db.maybeOne<Row>(`${LIST_SELECT} WHERE e.id = $1`, [id]);
    if (!r) throw new NotFoundError('export');
    return toExportRecord(r);
  },

  async all(q: { report?: string; q?: string; sort?: string }) {
    const rows = await db.many<Row>(`${LIST_SELECT} WHERE ($1::text IS NULL OR e.report = $1) ORDER BY e.created_at DESC LIMIT 5000`, [q.report ?? null]);
    let list = rows.map(toExportRecord);
    if (q.q) {
      const t = q.q.toLowerCase();
      list = list.filter((x) => `${x.report} ${x.format} ${x.by.name.en} ${x.range}`.toLowerCase().includes(t));
    }
    const sort = parseSort(q.sort, ['at', 'report', 'rows', 'format', 'by', 'status'], '-at');
    return sortRows(list, sort, (x, k) => (k === 'by' ? x.by.name.en : (x as unknown as Record<string, unknown>)[k]));
  },

  async page(q: { report?: string; q?: string; sort?: string; page: number; pageSize: number }) {
    return pageOf(await this.all(q), q.page, q.pageSize);
  },

  async file(id: string): Promise<{ buf: Buffer; fileName: string; contentType: string }> {
    const r = await db.maybeOne<{ file_data: Buffer | null; file_name: string | null; format: 'csv' | 'xlsx'; status: string; report: string }>(`SELECT file_data, file_name, format, status, report FROM ${T.exports_log} WHERE id = $1`, [id]);
    if (!r) throw new NotFoundError('export');
    if (r.status !== 'ready' || !r.file_data) throw new BusinessRuleError('EXPORT_NOT_READY', { status: r.status });
    return { buf: r.file_data, fileName: r.file_name ?? `${r.report}.${r.format}`, contentType: CONTENT_TYPES[r.format] };
  },
};

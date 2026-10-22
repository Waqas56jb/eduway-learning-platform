/** Admin payments (ADM-PAY-*), refunds (ADM-REF-*). */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { BusinessRuleError, NotFoundError, ValidationError, bulkItemError } from '../../common/errors/index.js';
import { assertPermission } from '../../common/middleware/rbac.js';
import type { AdminPrincipal } from '../../common/types/index.js';
import { orderBy } from '../../common/utils/pagination.js';
import { iso, isoOrNull, L, type Row } from '../commerce/lib.js';
import { toTransactionRow, type TransactionRow } from '../students/index.js';
import { subscriptionEngine } from '../subscriptions/engine.js';
import { getProvider } from './providers.js';
import { paymentWhere, paymentsRepo, TX_SELECT, type PaymentFilter } from './repository.js';

export interface RefundDto {
  id: string;
  transactionId: string;
  ref: string;
  student: { id: string; name: { en: string; ar: string }; mobile: string; avatarUrl: string | null };
  amount: number;
  currency: 'IQD' | 'USD';
  kind: 'full' | 'partial';
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: { id: string; name: { en: string; ar: string }; avatarUrl: string | null } | null;
  requestedAt: string;
  decidedBy: { id: string; name: { en: string; ar: string }; avatarUrl: string | null } | null;
  decidedAt: string | null;
  decisionNote: string | null;
  gatewayRefundId: string | null;
}

const PAY_SORT = { createdAt: 'pay.created_at', amount: 'pay.total', status: 'pay.status', gateway: 'pay.provider', paidAt: 'pay.paid_at', ref: 'pay.ref', student: 'u.name_en' };

const REFUND_SELECT = `
  SELECT rf.*, CASE WHEN rf.status = 'processed' THEN 'approved' ELSE rf.status END AS eff_status, pay.ref, pay.currency AS pay_currency,
         u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url,
         rq.id AS rq_id, rq.name_en AS rq_name_en, rq.name_ar AS rq_name_ar, rq.avatar_url AS rq_avatar_url,
         dc.id AS dc_id, dc.name_en AS dc_name_en, dc.name_ar AS dc_name_ar, dc.avatar_url AS dc_avatar_url
    FROM ${T.refunds} rf
    JOIN ${T.payments} pay ON pay.id = rf.payment_id
    JOIN ${T.users} u ON u.id = rf.user_id
    LEFT JOIN ${T.users} rq ON rq.id = rf.requested_by
    LEFT JOIN ${T.users} dc ON dc.id = rf.decided_by
   WHERE true`;

const ref3 = (r: Row, p: string) => (r[`${p}id`] ? { id: String(r[`${p}id`]), name: L(r, `${p}name`), avatarUrl: (r[`${p}avatar_url`] as string | null) ?? null } : null);

export function toRefund(r: Row): RefundDto {
  return {
    id: String(r.id),
    transactionId: String(r.payment_id),
    ref: String(r.ref),
    student: { id: String(r.u_id), name: L(r, 'u_name'), mobile: String(r.u_phone ?? ''), avatarUrl: (r.u_avatar_url as string | null) ?? null },
    amount: Number(r.amount),
    currency: (r.pay_currency ?? r.currency) as 'IQD' | 'USD',
    kind: r.kind as 'full' | 'partial',
    reason: String(r.reason ?? ''),
    status: r.eff_status as RefundDto['status'],
    requestedBy: ref3(r, 'rq_'),
    requestedAt: iso(r.requested_at),
    decidedBy: ref3(r, 'dc_'),
    decidedAt: isoOrNull(r.decided_at),
    decisionNote: (r.decision_note as string | null) ?? null,
    gatewayRefundId: (r.provider_ref as string | null) ?? null,
  };
}

export interface RefundFilter {
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  ids?: string[];
}

function refundWhere(f: RefundFilter) {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (cond: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(cond(`$${p.length}`));
  };
  if (f.status) add((n) => `(CASE WHEN rf.status = 'processed' THEN 'approved' ELSE rf.status END) = ${n}`, f.status);
  if (f.from) add((n) => `rf.requested_at >= ${n}::timestamptz`, f.from);
  if (f.to) add((n) => `rf.requested_at <= ${n}::timestamptz`, f.to);
  if (f.ids?.length) add((n) => `rf.id = ANY(${n}::uuid[])`, f.ids);
  if (f.q) {
    for (const word of f.q.trim().toLowerCase().split(/\s+/).slice(0, 5)) {
      add((n) => `(lower(pay.ref) LIKE ${n} OR lower(u.name_en) LIKE ${n} OR u.name_ar LIKE ${n} OR u.phone LIKE ${n} OR lower(rf.reason) LIKE ${n} OR lower(coalesce(rq.name_en, '')) LIKE ${n})`, `%${word}%`);
    }
  }
  return { sql: w.length ? ` AND ${w.join(' AND ')}` : '', params: p };
}

const REFUND_SORT = { requestedAt: 'rf.requested_at', amount: 'rf.amount', status: 'eff_status', decidedAt: 'rf.decided_at', ref: 'pay.ref', student: 'u.name_en' };

/** Settle an approved refund against the gateway + update payment, timeline, access (inside a tx). */
async function settleRefund(refundId: string, admin: AdminPrincipal, note: string | null, c: Executor): Promise<void> {
  const rf = await db.maybeOne<Row>(`SELECT * FROM ${T.refunds} WHERE id = $1 FOR UPDATE`, [refundId], c);
  if (!rf) throw new NotFoundError('refund');
  if (rf.status !== 'pending') throw new BusinessRuleError('REFUND_NOT_PENDING', { status: rf.status });
  const pay = await paymentsRepo.lock(String(rf.payment_id), c);
  if (!pay) throw new NotFoundError('payment');
  const remaining = Number(pay.total) - Number(pay.refunded_amount);
  const amount = Number(rf.amount);
  if (amount > remaining) throw new BusinessRuleError('REFUND_EXCEEDS_REMAINING', { refundable: remaining });
  const provider = getProvider(String(pay.provider));
  const { refundId: gwId } = provider ? await provider.refund({ paymentId: String(pay.id), providerRef: (pay.provider_ref as string | null) ?? null, amount, reason: String(rf.reason) }) : { refundId: null };
  await db.query(`UPDATE ${T.refunds} SET status = 'approved', decided_by = $2, decided_at = now(), decision_note = $3, provider_ref = $4 WHERE id = $1`, [refundId, admin.userId, note, gwId], c);
  const refunded = Number(pay.refunded_amount) + amount;
  const status = refunded >= Number(pay.total) ? 'refunded' : 'partially_refunded';
  await db.query(`UPDATE ${T.payments} SET refunded_amount = $2, status = $3 WHERE id = $1`, [pay.id, refunded, status], c);
  await paymentsRepo.addEvent(c, { paymentId: String(pay.id), kind: 'refund', status, note: `Refunded ${amount.toLocaleString('en-US')} ${pay.currency}${note ? ` — ${note}` : ''}`, actorId: admin.userId, payload: { refundId, gatewayRefundId: gwId } });
  if (status === 'refunded') {
    // Full refund revokes the package access bought with this payment (entitlement_logs via the engine).
    const sub = await db.maybeOne<{ id: string; status: string }>(`SELECT id, status FROM ${T.subscriptions} WHERE payment_id = $1`, [pay.id], c);
    if (sub && !['cancelled', 'expired'].includes(sub.status)) await subscriptionEngine.cancel(sub.id, `refund ${String(rf.id).slice(0, 8)}`, true, { id: admin.userId, name: admin.name }, c);
  }
}

export const adminPayments = {
  async list(f: PaymentFilter, sort: string | undefined, limit: number, offset: number): Promise<{ total: number; items: TransactionRow[] }> {
    const { sql, params } = paymentWhere(f);
    const base = `${TX_SELECT}${sql}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params)) ?? 0;
    const rows = await db.many<Row>(`${base} ORDER BY ${orderBy(sort, PAY_SORT, '-createdAt')}, pay.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    return { total, items: rows.map(toTransactionRow) };
  },

  async summary(f: PaymentFilter) {
    const { sql, params } = paymentWhere(f);
    const r = await db.one<Row>(
      `SELECT COALESCE(sum(x.total) FILTER (WHERE x.status IN ('paid', 'refunded', 'partially_refunded')), 0)::bigint AS gross,
              count(*) FILTER (WHERE x.status IN ('paid', 'partially_refunded', 'refunded'))::int AS paid_count,
              count(*) FILTER (WHERE x.status = 'failed')::int AS failed,
              count(*)::int AS total,
              COALESCE(sum(x.refunded_amount), 0)::bigint AS refunded,
              (SELECT count(*)::int FROM ${T.refunds} rf WHERE rf.status = 'pending' AND rf.payment_id IN (SELECT id FROM (${TX_SELECT}${sql}) y)) AS pending_refunds
         FROM (${TX_SELECT}${sql}) x`,
      params,
    );
    const total = Number(r.total);
    return { gross: Number(r.gross), paidCount: Number(r.paid_count), failureRate: total ? Math.round((Number(r.failed) / total) * 1000) / 10 : 0, refunded: Number(r.refunded), pendingRefunds: Number(r.pending_refunds), total };
  },

  async detail(id: string, admin?: AdminPrincipal) {
    const r = await paymentsRepo.getTx(id);
    if (!r) throw new NotFoundError('payment');
    const row = toTransactionRow(r);
    const extra = await db.one<Row>(
      `SELECT g.code AS g_code, g.name_en AS g_name_en, g.name_ar AS g_name_ar, p.price AS list_price
         FROM ${T.users} u LEFT JOIN ${T.student_profiles} sp ON sp.user_id = u.id LEFT JOIN ${T.governorates} g ON g.id = sp.governorate_id
         JOIN ${T.packages} p ON p.id = $2 WHERE u.id = $1`,
      [r.user_id, r.package_id],
    );
    const events = await db.many<Row>(
      `SELECT e.*, a.id AS a_id, a.name_en AS a_name_en, a.name_ar AS a_name_ar, a.avatar_url AS a_avatar_url
         FROM ${T.payment_events} e LEFT JOIN ${T.users} a ON a.id = e.actor_id WHERE e.payment_id = $1 ORDER BY e.created_at, e.id`,
      [id],
    );
    const pendingRow = await db.maybeOne<Row>(`${REFUND_SELECT} AND rf.payment_id = $1 AND rf.status = 'pending' ORDER BY rf.requested_at DESC LIMIT 1`, [id]);
    const timeline = events
      .filter((e) => e.kind !== 'webhook')
      .map((e) => ({
        id: String(e.id),
        status: (e.kind === 'refund_requested' ? 'refund_requested' : (e.status ?? e.kind)) as string,
        at: iso(e.created_at),
        note: String(e.note ?? ''),
        actor: ref3(e, 'a_'),
      }));
    const webhooks = events
      .filter((e) => e.kind === 'webhook')
      .map((e) => {
        const payload = (e.payload ?? {}) as Record<string, unknown>;
        return {
          id: String(e.id),
          type: String(payload.type ?? e.note ?? 'webhook'),
          verified: e.verified !== false,
          duplicate: payload.duplicate === true,
          idempotencyKey: String(e.provider_event_id ?? payload.idempotencyKey ?? ''),
          receivedAt: iso(e.created_at),
          payload,
        };
      });
    const listPrice = row.amount + row.discount;
    const canRefund = row.refundable > 0 && !pendingRow && (!admin || admin.isSuperAdmin || admin.permissions.has('payments.edit'));
    return {
      ...row,
      student: { ...row.student, governorate: { id: String(extra.g_code ?? ''), name: L(extra, 'g_name') } },
      package: { ...row.package, listPrice: Number(extra.list_price) },
      listPrice,
      timeline,
      webhooks,
      pendingRefund: pendingRow ? toRefund(pendingRow) : null,
      canRefund,
      canViewReceipt: !!row.receiptNumber && ['paid', 'partially_refunded', 'refunded'].includes(row.status),
    };
  },

  async requestRefund(paymentId: string, body: { kind: 'full' | 'partial'; amount?: number; reason: string; processNow?: boolean }, admin: AdminPrincipal) {
    if (body.processNow) assertPermission(admin, 'payments.approve');
    const refundId = await tx(async (c) => {
      const pay = await paymentsRepo.lock(paymentId, c);
      if (!pay) throw new NotFoundError('payment');
      if (!['paid', 'partially_refunded'].includes(String(pay.status))) throw new BusinessRuleError('NOT_REFUNDABLE', { status: pay.status });
      const refundable = Number(pay.total) - Number(pay.refunded_amount);
      if (refundable <= 0) throw new BusinessRuleError('NOT_REFUNDABLE', { refundable });
      const pending = await db.scalar<string>(`SELECT id FROM ${T.refunds} WHERE payment_id = $1 AND status = 'pending' LIMIT 1`, [paymentId], c);
      if (pending) throw new BusinessRuleError('REFUND_PENDING_EXISTS', { refundId: pending });
      let amount = refundable;
      if (body.kind === 'partial') {
        if (body.amount === undefined) throw new ValidationError([{ path: 'amount', message: 'amount is required for partial refunds' }]);
        if (body.amount > refundable) throw new BusinessRuleError('REFUND_EXCEEDS_REMAINING', { refundable });
        amount = body.amount;
      }
      const id = await db.scalar<string>(
        `INSERT INTO ${T.refunds} (payment_id, user_id, amount, currency, kind, reason, status, requested_by) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING id`,
        [paymentId, pay.user_id, amount, pay.currency, amount >= refundable ? 'full' : 'partial', body.reason, admin.userId],
        c,
      );
      await paymentsRepo.addEvent(c, { paymentId, kind: 'refund_requested', status: null, note: `${body.kind === 'full' ? 'Full' : 'Partial'} refund requested: ${amount.toLocaleString('en-US')} ${pay.currency} — ${body.reason}`, actorId: admin.userId, payload: { refundId: id } });
      if (body.processNow) await settleRefund(id as string, admin, 'processed immediately', c);
      return id as string;
    });
    return { refund: await this.refund(refundId), transaction: await this.detail(paymentId, admin) };
  },

  async refund(id: string): Promise<RefundDto> {
    const r = await db.maybeOne<Row>(`${REFUND_SELECT} AND rf.id = $1`, [id]);
    if (!r) throw new NotFoundError('refund');
    return toRefund(r);
  },

  async listRefunds(f: RefundFilter, sort: string | undefined, limit: number, offset: number) {
    const { sql, params } = refundWhere(f);
    const base = `${REFUND_SELECT}${sql}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params)) ?? 0;
    const rows = await db.many<Row>(`${base} ORDER BY ${orderBy(sort, REFUND_SORT, '-requestedAt')}, rf.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const { sql: s2, params: p2 } = refundWhere({ ...f, status: undefined });
    const counts = await db.many<{ st: string; n: number }>(`SELECT eff_status AS st, count(*)::int AS n FROM (${REFUND_SELECT}${s2}) x GROUP BY 1`, p2);
    const c = { pending: 0, approved: 0, rejected: 0 } as Record<'pending' | 'approved' | 'rejected', number>;
    for (const x of counts) if (x.st in c) c[x.st as keyof typeof c] = x.n;
    return { total, items: rows.map(toRefund), counts: c };
  },

  async refundSummary() {
    const r = await db.one<Row>(
      `SELECT count(*) FILTER (WHERE status = 'pending')::int AS pc, COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)::bigint AS pa,
              count(*) FILTER (WHERE status IN ('approved', 'processed'))::int AS ac, COALESCE(sum(amount) FILTER (WHERE status IN ('approved', 'processed')), 0)::bigint AS aa,
              count(*) FILTER (WHERE status = 'rejected')::int AS rc
         FROM ${T.refunds}`,
    );
    return { pending: { count: Number(r.pc), amount: Number(r.pa) }, approved: { count: Number(r.ac), amount: Number(r.aa) }, rejected: { count: Number(r.rc) } };
  },

  async approveRefund(id: string, admin: AdminPrincipal, note: string | null) {
    await tx((c) => settleRefund(id, admin, note, c));
    const refund = await this.refund(id);
    const r = await paymentsRepo.getTx(refund.transactionId);
    return { refund, transaction: toTransactionRow(r as Row) };
  },

  async rejectRefund(id: string, admin: AdminPrincipal, reason: string): Promise<RefundDto> {
    await tx(async (c) => {
      const rf = await db.maybeOne<Row>(`SELECT * FROM ${T.refunds} WHERE id = $1 FOR UPDATE`, [id], c);
      if (!rf) throw new NotFoundError('refund');
      if (rf.status !== 'pending') throw new BusinessRuleError('REFUND_NOT_PENDING', { status: rf.status });
      await db.query(`UPDATE ${T.refunds} SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`, [id, admin.userId, reason], c);
      await paymentsRepo.addEvent(c, { paymentId: String(rf.payment_id), kind: 'note', status: null, note: `Refund request rejected — ${reason}`, actorId: admin.userId, payload: { refundId: id } });
    });
    return this.refund(id);
  },

  async bulkApprove(ids: string[], admin: AdminPrincipal) {
    const succeeded: string[] = [];
    const failed: { id: string; code: string; reason?: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await tx((c) => settleRefund(id, admin, 'bulk approval', c));
        succeeded.push(id);
      } catch (e) {
        const err = e as { code?: string; reason?: string; message: string };
        failed.push({ id, ...bulkItemError(err) });
      }
    }
    return { succeeded, failed };
  },
};

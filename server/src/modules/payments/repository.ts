import { T } from '../../config/constants.js';
import { db, type Executor } from '../../config/db.js';
import type { Row } from '../commerce/lib.js';
import { likeContains } from '../../common/utils/like.js';

/** Base SELECT for TransactionRow (columns compatible with students' toTransactionRow). */
export const TX_SELECT = `
  SELECT pay.*, r.number AS receipt_number,
         u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url,
         p.id AS p_id, p.name_en AS p_name_en, p.name_ar AS p_name_ar,
         sc.id AS sc_id, sc.name_en AS sc_name_en, sc.name_ar AS sc_name_ar, sc.code AS sc_code,
         m.id AS m_id, m.name_en AS m_name_en, m.name_ar AS m_name_ar, m.avatar_url AS m_avatar_url
    FROM ${T.payments} pay
    JOIN ${T.users} u ON u.id = pay.user_id
    JOIN ${T.packages} p ON p.id = pay.package_id
    LEFT JOIN ${T.receipts} r ON r.payment_id = pay.id
    LEFT JOIN ${T.schools} sc ON sc.id = pay.school_id
    LEFT JOIN ${T.marketers} m ON m.id = pay.marketer_id
   WHERE true`;

export interface PaymentFilter {
  from?: string;
  to?: string;
  status?: string;
  gateway?: string;
  packageId?: string;
  source?: 'school' | 'promo' | 'direct';
  schoolId?: string;
  marketerId?: string;
  studentId?: string;
  platform?: string;
  q?: string;
  ids?: string[];
}

export function paymentWhere(f: PaymentFilter): { sql: string; params: unknown[] } {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (cond: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(cond(`$${p.length}`));
  };
  if (f.from) add((n) => `pay.created_at >= ${n}::timestamptz`, f.from);
  if (f.to) add((n) => `pay.created_at <= ${n}::timestamptz`, f.to);
  if (f.status) add((n) => `pay.status = ANY(string_to_array(${n}, ','))`, f.status);
  if (f.gateway) add((n) => `pay.provider = ANY(string_to_array(${n}, ','))`, f.gateway);
  if (f.packageId) add((n) => `pay.package_id = ${n}::uuid`, f.packageId);
  if (f.source === 'school') w.push('pay.school_id IS NOT NULL');
  if (f.source === 'promo') w.push('pay.school_id IS NULL AND pay.promo_code IS NOT NULL');
  if (f.source === 'direct') w.push('pay.school_id IS NULL AND pay.promo_code IS NULL');
  if (f.schoolId === '__none') w.push('pay.school_id IS NULL');
  else if (f.schoolId) add((n) => `pay.school_id = ${n}::uuid`, f.schoolId);
  if (f.marketerId === '__none') w.push('pay.marketer_id IS NULL');
  else if (f.marketerId) add((n) => `pay.marketer_id = ${n}::uuid`, f.marketerId);
  if (f.studentId) add((n) => `pay.user_id = ${n}::uuid`, f.studentId);
  if (f.platform) add((n) => `pay.platform::text = ${n}`, f.platform);
  if (f.ids?.length) add((n) => `pay.id = ANY(${n}::uuid[])`, f.ids);
  if (f.q) {
    for (const word of f.q.trim().toLowerCase().split(/\s+/).slice(0, 5)) {
      add((n) => `(lower(pay.ref) LIKE ${n} OR lower(u.name_en) LIKE ${n} OR u.name_ar LIKE ${n} OR u.phone LIKE ${n} OR lower(coalesce(pay.promo_code, '')) LIKE ${n})`, likeContains(word.replace(/^0/, '')));
    }
  }
  return { sql: w.length ? ` AND ${w.join(' AND ')}` : '', params: p };
}

export const paymentsRepo = {
  getTx(id: string, ex?: Executor) {
    return db.maybeOne<Row>(`${TX_SELECT} AND pay.id = $1`, [id], ex);
  },
  lock(id: string, ex: Executor) {
    return db.maybeOne<Row>(`SELECT * FROM ${T.payments} WHERE id = $1 FOR UPDATE`, [id], ex);
  },
  async addEvent(ex: Executor, e: { paymentId: string; kind: 'status' | 'webhook' | 'refund_requested' | 'refund' | 'note'; status?: string | null; note: string; actorId?: string | null; provider?: string | null; payload?: Record<string, unknown> }) {
    await db.query(
      `INSERT INTO ${T.payment_events} (payment_id, kind, status, note, actor_id, provider, payload) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [e.paymentId, e.kind, e.status ?? null, e.note, e.actorId ?? null, e.provider ?? null, JSON.stringify(e.payload ?? {})],
      ex,
    );
  },
};

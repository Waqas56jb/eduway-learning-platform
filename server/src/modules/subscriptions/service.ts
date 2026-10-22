/** Admin subscriptions (ADM-SBS-*) + student `GET /subscriptions/my` (PAY-03). */
import { T } from '../../config/constants.js';
import { db } from '../../config/db.js';
import { NotFoundError } from '../../common/errors/index.js';
import { mySubscription } from '../../common/services/student-summary.js';
import { orderBy } from '../../common/utils/pagination.js';
import { iso, isoOrNull, L, NONE, type Row } from '../commerce/lib.js';
import type { SubscriptionFilter } from './schemas.js';
import { likeContains } from '../../common/utils/like.js';

export interface AdminSubscriptionDto {
  id: string;
  student: { id: string; name: { en: string; ar: string }; mobile: string; avatarUrl: string | null };
  package: { id: string; name: { en: string; ar: string } };
  cycle: 'monthly' | 'yearly';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  source: 'payment' | 'manual' | 'trial';
  startedAt: string;
  endsAt: string;
  cancelledAt: string | null;
  lastPaymentId: string | null;
}

const EFFECTIVE_STATUS = `CASE WHEN s.status IN ('active', 'trial') AND s.ends_at <= now() THEN 'expired' WHEN s.status = 'pending' THEN 'active' ELSE s.status END`;
const SELECT = `
  SELECT s.id, s.billing_cycle, s.source, s.starts_at, s.ends_at, s.cancelled_at, s.payment_id, s.created_at, ${EFFECTIVE_STATUS} AS eff_status,
         u.id AS u_id, u.name_en AS u_name_en, u.name_ar AS u_name_ar, u.phone AS u_phone, u.avatar_url AS u_avatar_url,
         p.id AS p_id, p.name_en AS p_name_en, p.name_ar AS p_name_ar
    FROM ${T.subscriptions} s
    JOIN ${T.users} u ON u.id = s.user_id
    JOIN ${T.packages} p ON p.id = s.package_id
   WHERE s.status <> 'pending'`;

const SORT = { endsAt: 's.ends_at', startedAt: 's.starts_at', status: 'eff_status', createdAt: 's.created_at', student: 'u.name_en', package: 'p.name_en' };

export function toAdminSubscription(r: Row): AdminSubscriptionDto {
  return {
    id: String(r.id),
    student: { id: String(r.u_id), name: L(r, 'u_name'), mobile: String(r.u_phone ?? ''), avatarUrl: (r.u_avatar_url as string | null) ?? null },
    package: { id: String(r.p_id), name: L(r, 'p_name') },
    cycle: r.billing_cycle as AdminSubscriptionDto['cycle'],
    status: r.eff_status as AdminSubscriptionDto['status'],
    source: (r.source === 'promo' ? 'payment' : r.source) as AdminSubscriptionDto['source'],
    startedAt: iso(r.starts_at),
    endsAt: iso(r.ends_at),
    cancelledAt: isoOrNull(r.cancelled_at),
    lastPaymentId: (r.payment_id as string | null) ?? null,
  };
}

function where(f: SubscriptionFilter): { sql: string; params: unknown[] } {
  const w: string[] = [];
  const p: unknown[] = [];
  const add = (cond: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(cond(`$${p.length}`));
  };
  if (f.studentId) add((n) => `s.user_id = ${n}::uuid`, f.studentId);
  if (f.packageId) add((n) => `s.package_id = ${n}::uuid`, f.packageId);
  if (f.status) add((n) => `${EFFECTIVE_STATUS} = ${n}`, f.status);
  if (f.source) add((n) => `s.source = ${n}`, f.source);
  if (f.expiringBefore) add((n) => `s.ends_at <= ${n}::timestamptz`, f.expiringBefore);
  if (f.ids?.length) add((n) => `s.id = ANY(${n}::uuid[])`, f.ids);
  if (f.q) {
    for (const word of f.q.trim().toLowerCase().split(/\s+/).slice(0, 5)) add((n) => `(lower(u.name_en) LIKE ${n} OR u.name_ar LIKE ${n} OR u.phone LIKE ${n} OR lower(p.name_en) LIKE ${n})`, likeContains(word.replace(/^0/, '')));
  }
  return { sql: w.length ? ` AND ${w.join(' AND ')}` : '', params: p };
}

export const subscriptionsService = {
  my: (userId: string) => mySubscription(userId),

  async list(f: SubscriptionFilter, sort: string | undefined, limit: number, offset: number) {
    const { sql, params } = where(f);
    const base = `${SELECT}${sql}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params)) ?? 0;
    const rows = await db.many<Row>(`${base} ORDER BY ${orderBy(sort, SORT, 'endsAt')}, s.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    return { total, items: rows.map(toAdminSubscription) };
  },

  async get(id: string): Promise<AdminSubscriptionDto> {
    const r = await db.maybeOne<Row>(`${SELECT} AND s.id = $1`, [id]);
    if (!r) throw new NotFoundError('subscription');
    return toAdminSubscription(r);
  },
};

export { NONE };

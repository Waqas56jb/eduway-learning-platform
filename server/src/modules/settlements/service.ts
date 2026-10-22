/**
 * Partner settlements (ADM-SET-*): generate per period from the effective incentive rule (+ marketer milestone
 * bonuses), approve, mark paid with a reference. `calculateSettlements()` is the job entry point.
 */
import { T } from '../../config/constants.js';
import { db, tx, type Executor } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { BusinessRuleError, NotFoundError } from '../../common/errors/index.js';
import { orderBy } from '../../common/utils/pagination.js';
import { businessDay, iso, isoOrNull, L, type Row } from '../commerce/lib.js';
import { calcIncentive, parsePeriodKey, previousPeriod, type PeriodRange } from '../incentives/calculator.js';
import { incentiveRules, type PartnerType } from '../incentives/service.js';

type Ref = { id: string; name: { en: string; ar: string }; avatarUrl: string | null };
export interface SettlementDto {
  id: string;
  partnerType: PartnerType;
  partnerId: string;
  partner: { id: string; name: { en: string; ar: string }; code?: string; avatarUrl?: string | null };
  period: string;
  ruleId: string | null;
  ruleVersion: number | null;
  qualifiedStudents: number;
  amount: number;
  currency: 'IQD' | 'USD';
  status: 'pending' | 'approved' | 'paid';
  approvedBy: Ref | null;
  approvedAt: string | null;
  paidAt: string | null;
  paidBy: Ref | null;
  paymentReference: string | null;
  note: string | null;
  items?: { studentId: string; studentName: { en: string; ar: string }; paymentId: string; ref: string; paidAt: string; amount: number }[];
  createdAt: string;
}

const SELECT = `
  SELECT st.*, COALESCE(st.rule_version, ir.version) AS eff_rule_version,
         sc.id AS sc_id, sc.name_en AS sc_name_en, sc.name_ar AS sc_name_ar, sc.code AS sc_code,
         mk.id AS mk_id, mk.name_en AS mk_name_en, mk.name_ar AS mk_name_ar, mk.avatar_url AS mk_avatar_url,
         ap.id AS ap_id, ap.name_en AS ap_name_en, ap.name_ar AS ap_name_ar, ap.avatar_url AS ap_avatar_url,
         pb.id AS pb_id, pb.name_en AS pb_name_en, pb.name_ar AS pb_name_ar, pb.avatar_url AS pb_avatar_url,
         COALESCE(sc.name_en, mk.name_en) AS partner_name
    FROM ${T.settlements} st
    LEFT JOIN ${T.schools} sc ON sc.id = st.school_id
    LEFT JOIN ${T.marketers} mk ON mk.id = st.marketer_id
    LEFT JOIN ${T.incentive_rules} ir ON ir.id = st.rule_id
    LEFT JOIN ${T.users} ap ON ap.id = st.approved_by
    LEFT JOIN ${T.users} pb ON pb.id = st.paid_by
   WHERE st.status <> 'cancelled'`;

const uref = (r: Row, p: string): Ref | null => (r[`${p}id`] ? { id: String(r[`${p}id`]), name: L(r, `${p}name`), avatarUrl: (r[`${p}avatar_url`] as string | null) ?? null } : null);

export function toSettlement(r: Row): SettlementDto {
  const school = r.partner_type === 'school';
  return {
    id: String(r.id),
    partnerType: r.partner_type as PartnerType,
    partnerId: String(school ? r.school_id : r.marketer_id),
    partner: school ? { id: String(r.sc_id), name: L(r, 'sc_name'), code: String(r.sc_code ?? '') } : { id: String(r.mk_id), name: L(r, 'mk_name'), avatarUrl: (r.mk_avatar_url as string | null) ?? null },
    period: String(r.period).replace(/-Y$/, ''),
    ruleId: (r.rule_id as string | null) ?? null,
    ruleVersion: r.eff_rule_version === null || r.eff_rule_version === undefined ? null : Number(r.eff_rule_version),
    qualifiedStudents: Number(r.qualified_students),
    amount: Number(r.amount),
    currency: r.currency as 'IQD' | 'USD',
    status: r.status as SettlementDto['status'],
    approvedBy: uref(r, 'ap_'),
    approvedAt: isoOrNull(r.approved_at),
    paidAt: isoOrNull(r.paid_at),
    paidBy: uref(r, 'pb_'),
    paymentReference: (r.paid_reference as string | null) ?? null,
    note: r.notes ? String(r.notes) : null,
    createdAt: iso(r.created_at),
  };
}

export interface SettlementFilter {
  partnerType: PartnerType;
  partnerId?: string;
  period?: string;
  status?: string;
  q?: string;
  ids?: string[];
}

function where(f: SettlementFilter) {
  const w: string[] = [];
  const p: unknown[] = [f.partnerType];
  w.push('st.partner_type = $1');
  const add = (cond: (n: string) => string, v: unknown) => {
    p.push(v);
    w.push(cond(`$${p.length}`));
  };
  if (f.partnerId) add((n) => `(st.school_id = ${n}::uuid OR st.marketer_id = ${n}::uuid)`, f.partnerId);
  if (f.period) add((n) => `st.period = ${n}`, f.period);
  if (f.status) add((n) => `st.status = ${n}`, f.status);
  if (f.ids?.length) add((n) => `st.id = ANY(${n}::uuid[])`, f.ids);
  if (f.q) add((n) => `(lower(COALESCE(sc.name_en, mk.name_en)) LIKE ${n} OR COALESCE(sc.name_ar, mk.name_ar) LIKE ${n} OR st.period LIKE ${n} OR lower(COALESCE(sc.code, '')) LIKE ${n})`, `%${f.q.toLowerCase()}%`);
  return { sql: ` AND ${w.join(' AND ')}`, params: p };
}

const SORT = { period: 'st.period', qualifiedStudents: 'st.qualified_students', amount: 'st.amount', status: 'st.status', paidAt: 'st.paid_at', createdAt: 'st.created_at', approvedAt: 'st.approved_at', partner: 'partner_name' };

interface PartnerCalc {
  partnerId: string;
  qualified: number;
  items: { userId: string; paymentId: string; amount: number }[];
}

async function partnerPayments(partnerType: PartnerType, range: PeriodRange, partnerIds: string[] | undefined, ex: Executor): Promise<PartnerCalc[]> {
  const col = partnerType === 'school' ? 'school_id' : 'marketer_id';
  const partners = partnerType === 'school'
    ? await db.many<{ id: string }>(`SELECT id FROM ${T.schools} WHERE deleted_at IS NULL AND is_partner AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`, [partnerIds ?? null], ex)
    : await db.many<{ id: string }>(`SELECT id FROM ${T.marketers} WHERE deleted_at IS NULL AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))`, [partnerIds ?? null], ex);
  const pays = await db.many<{ partner: string; id: string; user_id: string; total: number }>(
    `SELECT ${col} AS partner, id, user_id, total FROM ${T.payments}
      WHERE ${col} = ANY($1::uuid[]) AND status IN ('paid', 'partially_refunded') AND paid_at >= $2 AND paid_at < $3`,
    [partners.map((p) => p.id), range.from, range.to],
    ex,
  );
  return partners.map((p) => {
    const mine = pays.filter((x) => x.partner === p.id);
    return { partnerId: p.id, qualified: new Set(mine.map((x) => x.user_id)).size, items: mine.map((x) => ({ userId: x.user_id, paymentId: x.id, amount: Number(x.total) })) };
  });
}

export const settlements = {
  async list(f: SettlementFilter, sort: string | undefined, limit: number, offset: number) {
    const { sql, params } = where(f);
    const base = `${SELECT}${sql}`;
    const total = (await db.scalar<number>(`SELECT count(*)::int FROM (${base}) x`, params)) ?? 0;
    const rows = await db.many<Row>(`${base} ORDER BY ${orderBy(sort, SORT, '-period')}, st.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    const { sql: s2, params: p2 } = where({ partnerType: f.partnerType, partnerId: f.partnerId });
    const agg = await db.many<{ status: string; amount: number; n: number }>(`SELECT x.status, COALESCE(sum(x.amount), 0)::bigint AS amount, count(*)::int AS n FROM (${SELECT}${s2}) x GROUP BY 1`, p2);
    const periods = await db.many<{ period: string }>(`SELECT DISTINCT x.period FROM (${SELECT}${s2}) x ORDER BY 1 DESC`, p2);
    const totals = { pending: { amount: 0, count: 0 }, approved: { amount: 0, count: 0 }, paid: { amount: 0, count: 0 } } as Record<'pending' | 'approved' | 'paid', { amount: number; count: number }>;
    for (const a of agg) if (a.status in totals) totals[a.status as keyof typeof totals] = { amount: Number(a.amount), count: a.n };
    return { total, items: rows.map(toSettlement), totals, periods: periods.map((p) => p.period.replace(/-Y$/, '')) };
  },

  async get(id: string, withItems = true, ex?: Executor): Promise<SettlementDto> {
    const r = await db.maybeOne<Row>(`${SELECT} AND st.id = $1`, [id], ex);
    if (!r) throw new NotFoundError('settlement');
    const dto = toSettlement(r);
    if (withItems) {
      const items = await db.many<Row>(
        `SELECT si.user_id, si.payment_id, si.amount, u.name_en, u.name_ar, p.ref, p.paid_at
           FROM ${T.settlement_items} si JOIN ${T.users} u ON u.id = si.user_id JOIN ${T.payments} p ON p.id = si.payment_id
          WHERE si.settlement_id = $1 ORDER BY p.paid_at`,
        [id],
        ex,
      );
      dto.items = items.map((i) => ({ studentId: String(i.user_id), studentName: L(i, 'name'), paymentId: String(i.payment_id), ref: String(i.ref), paidAt: iso(i.paid_at), amount: Number(i.amount) }));
    }
    return dto;
  },

  async partnerTypeOf(id: string): Promise<PartnerType> {
    const t = await db.scalar<PartnerType>(`SELECT partner_type::text FROM ${T.settlements} WHERE id = $1`, [id]);
    if (!t) throw new NotFoundError('settlement');
    return t;
  },

  /** ADM-SET-03 / job: pending settlements recalculated; approved/paid untouched. */
  async generate(input: { partnerType: PartnerType; period: string; partnerIds?: string[] }): Promise<{ created: number; updated: number; skipped: number; settlements: SettlementDto[] }> {
    const range = parsePeriodKey(input.period);
    if (!range) throw new BusinessRuleError('PERIOD_INVALID', { period: input.period });
    return tx(async (c) => {
      const rule = await incentiveRules.forPeriod(input.partnerType, range, c);
      const calcs = await partnerPayments(input.partnerType, range, input.partnerIds, c);
      if (!rule) return { created: 0, updated: 0, skipped: calcs.length, settlements: [] };
      const col = input.partnerType === 'school' ? 'school_id' : 'marketer_id';
      let created = 0;
      let updated = 0;
      let skipped = 0;
      const ids: string[] = [];
      for (const pc of calcs) {
        const res = calcIncentive(rule, pc.qualified);
        let bonus = 0;
        let awardIds: string[] = [];
        if (input.partnerType === 'marketer') {
          const awards = await db.many<{ id: string; reward: number }>(
            `SELECT id, reward FROM ${T.marketer_milestone_awards} WHERE marketer_id = $1 AND (settlement_id IS NULL OR settlement_id IN (SELECT id FROM ${T.settlements} WHERE marketer_id = $1 AND period = $2 AND status = 'pending'))`,
            [pc.partnerId, range.key],
            c,
          );
          bonus = awards.reduce((s, a) => s + Number(a.reward), 0);
          awardIds = awards.map((a) => a.id);
        }
        const amount = res.amount + bonus;
        const existing = await db.maybeOne<{ id: string; status: string }>(`SELECT id, status FROM ${T.settlements} WHERE ${col} = $1 AND period = $2 AND status <> 'cancelled' FOR UPDATE`, [pc.partnerId, range.key], c);
        if (existing && existing.status !== 'pending') {
          skipped++;
          continue;
        }
        if (!existing && amount <= 0) {
          skipped++;
          continue;
        }
        const breakdown = JSON.stringify({ tier: res.tier?.label ?? null, breakdown: res.breakdown, incentive: res.amount, milestoneBonus: bonus, awards: awardIds });
        let id: string;
        if (existing) {
          id = existing.id;
          await db.query(`UPDATE ${T.settlements} SET rule_id = $2, rule_version = $3, qualified_students = $4, amount = $5, breakdown = $6::jsonb WHERE id = $1`, [id, rule.id, rule.version, pc.qualified, amount, breakdown], c);
          await db.query(`DELETE FROM ${T.settlement_items} WHERE settlement_id = $1`, [id], c);
          updated++;
        } else {
          id = (await db.scalar<string>(
            `INSERT INTO ${T.settlements} (partner_type, ${col}, period, period_start, period_end, rule_id, rule_version, qualified_students, amount, currency, status, breakdown)
             VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,$9,'IQD','pending',$10::jsonb) RETURNING id`,
            [input.partnerType, pc.partnerId, range.key, businessDay(range.from), businessDay(new Date(range.to.getTime() - 1000)), rule.id, rule.version, pc.qualified, amount, breakdown],
            c,
          )) as string;
          created++;
        }
        for (const it of pc.items) {
          await db.query(`INSERT INTO ${T.settlement_items} (settlement_id, user_id, payment_id, amount) VALUES ($1,$2,$3,$4) ON CONFLICT (settlement_id, payment_id) DO NOTHING`, [id, it.userId, it.paymentId, it.amount], c);
        }
        if (awardIds.length) await db.query(`UPDATE ${T.marketer_milestone_awards} SET settlement_id = $2 WHERE id = ANY($1::uuid[])`, [awardIds, id], c);
        ids.push(id);
      }
      const out: SettlementDto[] = [];
      for (const id of ids) out.push(await this.get(id, false, c));
      return { created, updated, skipped, settlements: out };
    });
  },

  async approve(id: string, adminId: string): Promise<SettlementDto> {
    const n = await db.exec(`UPDATE ${T.settlements} SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1 AND status = 'pending'`, [id, adminId]);
    if (!n) {
      const cur = await this.get(id, false);
      throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: 'approved' });
    }
    return this.get(id);
  },

  async markPaid(id: string, adminId: string, body: { paymentReference?: string; note?: string; paidAt?: string }): Promise<SettlementDto> {
    const n = await db.exec(
      `UPDATE ${T.settlements} SET status = 'paid', paid_at = COALESCE($3::timestamptz, now()), paid_by = $2, paid_reference = COALESCE($4, paid_reference),
              notes = CASE WHEN $5::text IS NULL THEN notes ELSE $5 END
        WHERE id = $1 AND status = 'approved'`,
      [id, adminId, body.paidAt ?? null, body.paymentReference ?? null, body.note ?? null],
    );
    if (!n) {
      const cur = await this.get(id, false);
      throw new BusinessRuleError('INVALID_TRANSITION', { from: cur.status, to: 'paid' });
    }
    return this.get(id);
  },
};

/**
 * Job entry point (settlement-calculation): for both partner types, generate settlements for the PREVIOUS
 * period of the active rule's period type (or an explicit period).
 */
export async function calculateSettlements(opts: { partnerType?: PartnerType; period?: string } = {}): Promise<{ partnerType: PartnerType; period: string; created: number; updated: number; skipped: number }[]> {
  const out: { partnerType: PartnerType; period: string; created: number; updated: number; skipped: number }[] = [];
  for (const pt of opts.partnerType ? [opts.partnerType] : (['school', 'marketer'] as PartnerType[])) {
    const rule = await incentiveRules.active(pt);
    if (!rule && !opts.period) continue;
    const period = opts.period ?? previousPeriod(rule?.period ?? 'monthly').key;
    const r = await settlements.generate({ partnerType: pt, period });
    out.push({ partnerType: pt, period, created: r.created, updated: r.updated, skipped: r.skipped });
  }
  logger.info({ out }, 'settlements calculated');
  return out;
}
